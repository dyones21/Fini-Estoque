import React, { createContext, useContext, useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import {
  Product,
  NFEntry,
  StockTransfer,
  StockMovement,
  UserProfile,
  LocationType,
  AppNotification,
  CloudBackupInfo,
  UserRole,
  UserPermissions,
  Tenant,
} from '../types';
import {
  INITIAL_PRODUCTS,
  INITIAL_NF_ENTRIES,
  INITIAL_TRANSFERS,
  INITIAL_MOVEMENTS,
  INITIAL_USERS,
} from '../data/initialData';
import { INITIAL_TENANTS } from '../data/initialTenants';
import { getStarterProductsForTenant } from '../utils/tenantUtils';
import { isLowStock, getDaysToExpiration } from '../utils/inventoryUtils';
import { getRolePermissions } from '../utils/permissionUtils';
import { notifyLowStock, notifyNewNFEntry } from '../utils/notificationService';
import {
  authFetch,
  safeParseJson,
  syncUserWithPostgres,
  saveUserViaApi,
  deleteUserViaApi,
} from '../utils/apiAuth';
import {
  auth,
  signInWithGoogle,
  signOutFirebase,
  onAuthStateChanged,
} from '../lib/firebase';

interface StockContextType {
  // State
  products: Product[];
  categories: string[];
  nfEntries: NFEntry[];
  transfers: StockTransfer[];
  movements: StockMovement[];
  users: UserProfile[];
  allUsers: UserProfile[];
  currentUser: UserProfile;
  isAuthenticated: boolean;
  isAuthModalOpen: boolean;
  isAuthChecking: boolean;
  activeLocation: LocationType;
  notifications: AppNotification[];
  cloudInfo: CloudBackupInfo;
  unreadNotificationCount: number;
  isLoadingCloudSql: boolean;
  isLoadingSupabase: boolean;

  // Tenants (Multi-tenant ERP)
  tenants: Tenant[];
  currentTenant: Tenant;
  isTenantModalOpen: boolean;
  setCurrentTenantId: (tenantId: string) => void;
  addTenant: (tenant: Omit<Tenant, 'id' | 'createdAt'>) => Tenant;
  updateTenant: (tenant: Tenant) => void;
  deleteTenant: (tenantId: string) => void;
  openTenantModal: () => void;
  closeTenantModal: () => void;

  // Actions & Auth
  setActiveLocation: (loc: LocationType) => void;
  setCurrentUserRole: (role: UserRole) => void;
  loginWithPin: (userId: string, pin: string) => boolean;
  loginWithGoogleAccount: () => Promise<{ success: boolean; redirected?: boolean }>;
  logoutAndLock: () => void;
  openSwitchUserModal: () => void;
  closeAuthModal: () => void;
  updateUser: (user: UserProfile) => void;
  addUser: (user: UserProfile) => void;
  deleteUser: (userId: string) => void;
  checkPermission: (permissionKey: keyof UserPermissions) => boolean;

  // Category Operations
  addCategory: (newCategoryName: string) => boolean;

  // Product Operations
  addProduct: (product: Omit<Product, 'id' | 'lastUpdated' | 'totalSalesQuantity' | 'totalSalesValue'> & { id?: string }) => Promise<Product>;
  updateProduct: (id: string, product: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  // Inventory Operations
  addNFEntry: (nf: Omit<NFEntry, 'id' | 'receiveDate'>) => Promise<void>;
  transferStock: (productId: string, quantity: number, notes?: string) => Promise<{ success: boolean; message: string }>;
  registerMovement: (
    productId: string,
    type: StockMovement['type'],
    quantity: number,
    location: 'loja' | 'deposito' | 'ambos',
    reason?: string,
    unitPrice?: number
  ) => Promise<void>;

  // Notifications
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  // Cloud & Backup
  triggerCloudSync: () => Promise<void>;
  exportBackupJSON: () => void;
  importBackupJSON: (jsonData: string) => boolean;
  resetToDefaultData: () => Promise<void>;
  wipeSystemData: (pin?: string) => Promise<void>;
  verifyAdminPin: (pin: string) => boolean;
}

const StockContext = createContext<StockContextType | undefined>(undefined);

export const DEFAULT_CATEGORIES = [
  'Balas de Gelatina',
  'Marshmallows',
  'Regaliz & Tubes',
  'Chicletes',
  'Balas Azedas',
  'Caixas & Displays',
  'Linha Importada & Especiais',
];

const USERS_STORAGE_KEY = 'FINI_USERS_V2';
const CURRENT_USER_KEY = 'FINI_CURRENT_USER_ID_V2';
const CATEGORIES_STORAGE_KEY = 'FINI_CATEGORIES_V1';
const TENANTS_STORAGE_KEY = 'FINI_TENANTS_V1';

export const StockProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Multi-tenant State
  const [tenants, setTenants] = useState<Tenant[]>(() => {
    try {
      const saved = localStorage.getItem(TENANTS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Error loading tenants from storage:', e);
    }
    return INITIAL_TENANTS;
  });

  const [currentTenantId, setCurrentTenantId] = useState<string>(() => {
    return INITIAL_TENANTS[0].id;
  });

  const [isTenantModalOpen, setIsTenantModalOpen] = useState<boolean>(false);

  const currentTenant = useMemo(() => {
    return tenants.find((t) => t.id === currentTenantId) || tenants[0] || INITIAL_TENANTS[0];
  }, [tenants, currentTenantId]);

  // Categories State
  const [categories, setCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(CATEGORIES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Error loading categories from storage:', e);
    }
    return DEFAULT_CATEGORIES;
  });

  // Users State
  const [allUsers, setAllUsers] = useState<UserProfile[]>(() => {
    try {
      const saved = localStorage.getItem(USERS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Error loading users from storage:', e);
    }
    return INITIAL_USERS;
  });

  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    try {
      const savedId = localStorage.getItem(CURRENT_USER_KEY);
      if (savedId) {
        const found = allUsers.find((u) => u.id === savedId);
        if (found) return found;
      }
    } catch (e) {
      console.error('Error loading current user from storage:', e);
    }
    return allUsers[0] || INITIAL_USERS[0];
  });

  // Multi-tenant product and data states (populated exclusively from PostgreSQL server)
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allNfEntries, setAllNfEntries] = useState<NFEntry[]>([]);
  const [allTransfers, setAllTransfers] = useState<StockTransfer[]>([]);
  const [allMovements, setAllMovements] = useState<StockMovement[]>([]);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(true);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [activeLocation, setActiveLocation] = useState<LocationType>('deposito');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoadingServer, setIsLoadingServer] = useState<boolean>(false);

  // Cloud Backup Info
  const [cloudInfo, setCloudInfo] = useState<CloudBackupInfo>({
    lastSyncTime: new Date().toISOString(),
    status: 'synced',
    backupSizeKB: 0,
    totalRecords: 0,
    autoSyncEnabled: true,
  });

  const notifiedLowStockRef = useRef<Set<string>>(new Set());

  // Filtered views without tenant restrictions (Single Enterprise ERP)
  const products = useMemo(() => {
    return allProducts;
  }, [allProducts]);

  const nfEntries = useMemo(() => {
    return allNfEntries;
  }, [allNfEntries]);

  const transfers = useMemo(() => {
    return allTransfers;
  }, [allTransfers]);

  const movements = useMemo(() => {
    return allMovements;
  }, [allMovements]);

  const users = useMemo(() => {
    return allUsers;
  }, [allUsers]);

  // Persist Tenant / Categories / Users meta locally
  useEffect(() => {
    try {
      localStorage.setItem(TENANTS_STORAGE_KEY, JSON.stringify(tenants));
    } catch (e) {
      console.error('Error saving tenants to storage:', e);
    }
  }, [tenants]);

  useEffect(() => {
    try {
      localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
    } catch (e) {
      console.error('Error saving categories to storage:', e);
    }
  }, [categories]);

  useEffect(() => {
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(allUsers));
    } catch (e) {
      console.error('Error saving users to storage:', e);
    }
  }, [allUsers]);

  // Observa mudanças em allUsers (sincronização periódica com o banco de dados) e atualiza o currentUser se houver alteração de role, permissões, nome ou status ativo
  useEffect(() => {
    if (!currentUser || (!currentUser.id && !currentUser.email)) return;

    const matchingUser = allUsers.find(
      (u) =>
        (currentUser.id && u.id === currentUser.id) ||
        (currentUser.email && u.email && u.email.toLowerCase() === currentUser.email.toLowerCase())
    );

    if (!matchingUser) return;

    const roleChanged = matchingUser.role !== currentUser.role;
    const nameChanged = Boolean(matchingUser.name && matchingUser.name !== currentUser.name);
    const activeChanged = matchingUser.active !== undefined && matchingUser.active !== currentUser.active;

    // Compara as permissões atuais com as novas permissões do perfil atualizado
    const newPermissions = matchingUser.permissions || getRolePermissions(matchingUser.role);
    const currentPermissions = currentUser.permissions || getRolePermissions(currentUser.role);
    const permissionsChanged = JSON.stringify(newPermissions) !== JSON.stringify(currentPermissions);

    if (roleChanged || nameChanged || activeChanged || permissionsChanged) {
      const newRole = matchingUser.role;
      const updatedUser: UserProfile = {
        ...currentUser,
        ...matchingUser,
        role: newRole,
        permissions: newPermissions,
        pin: matchingUser.pin || currentUser.pin || '',
        avatarUrl: matchingUser.avatarUrl || currentUser.avatarUrl || (newRole === 'super_admin' ? 'emoji:👑' : 'emoji:🍬'),
      };

      setCurrentUser(updatedUser);
      try {
        localStorage.setItem(CURRENT_USER_KEY, updatedUser.id);
      } catch (e) {
        console.error('Error updating saved current user:', e);
      }
    }
  }, [allUsers, currentUser?.id, currentUser?.email, currentUser?.role, currentUser?.name, currentUser?.active, currentUser?.permissions]);

  // Helper de notificação amigável para acessos bloqueados por falta de permissão (HTTP 403)
  const handle403PermissionDenied = (actionName?: string) => {
    const errorText = 'Você não tem permissão para esta ação.';
    console.warn(`[Segurança 403] Bloqueio de autorização no servidor: ${actionName || 'Ação restrita'}`);

    setNotifications((prev) => [
      {
        id: `perm-error-${Date.now()}`,
        title: 'Acesso Restrito (Permissão 403)',
        message: actionName ? `${errorText} (${actionName})` : errorText,
        type: 'system',
        severity: 'high',
        timestamp: new Date().toISOString(),
        read: false,
      },
      ...prev,
    ]);
  };

  // Sincronização e perfil de usuário autenticado (Firebase Auth)
  const handleUserAuthenticated = async (userPayload: { uid: string; email?: string | null; displayName?: string | null }) => {
    const email = (userPayload.email || '').trim().toLowerCase();
    const localUser = allUsers.find(
      (u) =>
        u.email?.toLowerCase() === email ||
        u.id === userPayload.uid
    );
    const name = localUser?.name || userPayload.displayName || email.split('@')[0] || 'Usuário Fini';

    try {
      const syncedUser = await syncUserWithPostgres({
        uid: userPayload.uid,
        email: email,
        displayName: name,
      });

      const role = ((syncedUser && syncedUser.role) || localUser?.role || (email.toLowerCase().includes('admin') || email.toLowerCase() === 'dyones21@gmail.com' ? 'super_admin' : 'gerente_loja')) as UserRole;
      const updatedProfile: UserProfile = {
        id: (syncedUser && syncedUser.uid) || userPayload.uid,
        name: (syncedUser && syncedUser.name) || name,
        email: (syncedUser && syncedUser.email) || email,
        role: role,
        pin: localUser?.pin || '',
        active: true,
        avatarUrl: localUser?.avatarUrl || (role === 'super_admin' ? 'emoji:👑' : 'emoji:🍬'),
        permissions: getRolePermissions(role),
      };

      setAllUsers((prev) => {
        const exists = prev.some(
          (u) => u.id === updatedProfile.id || (u.email && updatedProfile.email && u.email.toLowerCase() === updatedProfile.email.toLowerCase())
        );
        if (exists) {
          return prev.map((u) =>
            u.id === updatedProfile.id || (u.email && updatedProfile.email && u.email.toLowerCase() === updatedProfile.email.toLowerCase())
              ? { ...u, ...updatedProfile }
              : u
          );
        }
        return [...prev, updatedProfile];
      });

      setCurrentUser(updatedProfile);
      setIsAuthenticated(true);
      setIsAuthModalOpen(false);
      setIsAuthChecking(false);

      // Puxa automaticamente os dados atualizados do servidor
      fetchServerData();
    } catch (error) {
      console.warn('Aviso: Falha ao sincronizar usuário via API, usando perfil local:', error);
      const fallbackRole: UserRole = (localUser?.role || (email.toLowerCase().includes('admin') || email.toLowerCase() === 'dyones21@gmail.com' ? 'super_admin' : 'gerente_loja')) as UserRole;
      const fallbackProfile: UserProfile = {
        id: userPayload.uid,
        name: name,
        email: email,
        role: fallbackRole,
        pin: localUser?.pin || '',
        active: true,
        avatarUrl: localUser?.avatarUrl || (fallbackRole === 'super_admin' ? 'emoji:👑' : 'emoji:🍬'),
        permissions: getRolePermissions(fallbackRole),
      };
      setCurrentUser(fallbackProfile);
      setIsAuthenticated(true);
      setIsAuthModalOpen(false);
      setIsAuthChecking(false);
    } finally {
      setIsAuthChecking(false);
    }
  };

  // Login com Conta Google via Firebase
  const loginWithGoogleAccount = async (): Promise<{ success: boolean; redirected?: boolean }> => {
    try {
      const user = await signInWithGoogle();
      if (user) {
        await handleUserAuthenticated({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
        });
        return { success: true, redirected: false };
      }
    } catch (err: any) {
      console.error('Erro no login com Google:', err);
      throw err;
    }
    return { success: false, redirected: false };
  };

  // Listener para Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        handleUserAuthenticated({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
        });
      } else {
        setIsAuthenticated(false);
        setIsAuthModalOpen(true);
        setIsAuthChecking(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Sincronização periódica em segundo plano com o servidor Express (a cada 25s)
  useEffect(() => {
    const interval = setInterval(() => {
      if (isAuthenticated) {
        fetchServerData();
      }
    }, 25000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Auth Functions
  const loginWithPin = (userId: string, pin: string): boolean => {
    const target = allUsers.find((u) => u.id === userId);
    if (target && target.pin && target.pin === pin) {
      setCurrentUser(target);
      setIsAuthenticated(true);
      setIsAuthModalOpen(false);
      try {
        localStorage.setItem(CURRENT_USER_KEY, target.id);
      } catch (e) {
        console.error('Error saving current user:', e);
      }
      return true;
    }
    return false;
  };

  const logoutAndLock = async () => {
    try {
      await signOutFirebase();
    } catch (e) {
      console.warn('Erro ao deslogar do Firebase:', e);
    }
    setIsAuthenticated(false);
    setIsAuthModalOpen(true);
  };

  const openSwitchUserModal = () => {
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    if (isAuthenticated) {
      setIsAuthModalOpen(false);
    }
  };

  const updateUser = async (updatedUser: UserProfile) => {
    const previousUsers = [...allUsers];
    const previousCurrentUser = currentUser;

    const userToSave: UserProfile = {
      ...updatedUser,
      permissions: updatedUser.permissions || getRolePermissions(updatedUser.role),
    };

    setAllUsers((prev) => {
      const next = prev.map((u) => (u.id === userToSave.id ? userToSave : u));
      return next;
    });
    setCurrentUser((prev) => (prev && prev.id === userToSave.id ? userToSave : prev));

    try {
      await saveUserViaApi({
        uid: userToSave.id,
        email: userToSave.email,
        name: userToSave.name,
        role: userToSave.role,
        pin: userToSave.pin || undefined,
      });
    } catch (e: any) {
      // Reverte em caso de erro
      setAllUsers(previousUsers);
      setCurrentUser(previousCurrentUser);
      console.error('Falha ao sincronizar atualização do usuário no servidor:', e);
      throw e;
    }
  };

  const addUser = async (newUser: UserProfile) => {
    const previousUsers = [...allUsers];
    const userToSave: UserProfile = {
      ...newUser,
      permissions: newUser.permissions || getRolePermissions(newUser.role),
    };

    setAllUsers((prev) => {
      const exists = prev.some((u) => u.id === userToSave.id || u.email?.toLowerCase() === userToSave.email?.toLowerCase());
      return exists
        ? prev.map((u) => (u.id === userToSave.id || u.email?.toLowerCase() === userToSave.email?.toLowerCase() ? userToSave : u))
        : [...prev, userToSave];
    });

    try {
      await saveUserViaApi({
        uid: userToSave.id,
        email: userToSave.email,
        name: userToSave.name,
        role: userToSave.role,
        pin: userToSave.pin || undefined,
      });
    } catch (e: any) {
      // Reverte em caso de erro
      setAllUsers(previousUsers);
      console.error('Falha ao persistir novo usuário no servidor:', e);
      throw e;
    }
  };

  const deleteUser = async (userId: string) => {
    const previousUsers = [...allUsers];
    const previousCurrentUser = currentUser;
    const targetUser = allUsers.find((u) => u.id === userId || u.email?.toLowerCase() === userId.toLowerCase());
    const targetIdentifier = targetUser?.id || targetUser?.email || userId;

    setAllUsers((prev) => {
      return prev.filter(
        (u) => u.id !== userId && u.id !== targetIdentifier && u.email?.toLowerCase() !== targetIdentifier.toLowerCase()
      );
    });

    setCurrentUser((prev) => {
      if (
        prev &&
        (prev.id === userId ||
          prev.id === targetIdentifier ||
          prev.email?.toLowerCase() === targetIdentifier.toLowerCase())
      ) {
        const remaining = allUsers.filter(
          (u) =>
            u.id !== userId &&
            u.id !== targetIdentifier &&
            u.email?.toLowerCase() !== targetIdentifier.toLowerCase()
        );
        const fallback = remaining[0] || INITIAL_USERS[0];
        return fallback;
      }
      return prev;
    });

    try {
      await deleteUserViaApi(targetIdentifier);
    } catch (error) {
      setAllUsers(previousUsers);
      setCurrentUser(previousCurrentUser);
      console.error('Erro ao excluir usuário no servidor:', error);
      throw error;
    }
  };

  const checkPermission = (permissionKey: keyof UserPermissions): boolean => {
    if (!currentUser || !currentUser.permissions) return false;
    if (currentUser.role === 'admin' || currentUser.role === 'super_admin') return true;
    return Boolean(currentUser.permissions[permissionKey]);
  };

  // Fetch initial data exclusively through Express Server API routes (/api/...)
  const fetchServerData = async () => {
    setIsLoadingServer(true);
    try {
      setCloudInfo((prev) => ({ ...prev, status: 'syncing' }));

      const [resProd, resMov, resNFs, resSales, resUsers] = await Promise.all([
        authFetch('/api/products').catch(() => null),
        authFetch('/api/movements').catch(() => null),
        authFetch('/api/nf-entries').catch(() => null),
        authFetch('/api/sales').catch(() => null),
        authFetch('/api/users').catch(() => null),
      ]);

      let loadedProducts: Product[] = [];
      let loadedMovements: StockMovement[] = [];
      let loadedNFs: NFEntry[] = [];
      let loadedUsers: any[] = [];
      let loadedSales: any[] = [];

      const [dataProd, dataMov, dataNFs, dataSales, dataUsers] = await Promise.all([
        safeParseJson(resProd),
        safeParseJson(resMov),
        safeParseJson(resNFs),
        safeParseJson(resSales),
        safeParseJson(resUsers),
      ]);

      if (Array.isArray(dataProd)) loadedProducts = dataProd;
      if (Array.isArray(dataMov)) loadedMovements = dataMov;
      if (Array.isArray(dataNFs)) loadedNFs = dataNFs;
      if (Array.isArray(dataSales)) loadedSales = dataSales;
      if (Array.isArray(dataUsers)) loadedUsers = dataUsers;

      // Merge aggregates from sales into products
      const salesAggregates = new Map<string, { totalQty: number; totalVal: number }>();
      loadedSales.forEach((s: any) => {
        const pId = s.productId || s.product_id;
        const qty = Number(s.quantity) || 0;
        const val = Number(s.totalAmount ?? s.total_amount) || 0;
        if (pId) {
          const current = salesAggregates.get(pId) || { totalQty: 0, totalVal: 0 };
          salesAggregates.set(pId, {
            totalQty: current.totalQty + qty,
            totalVal: current.totalVal + val,
          });
        }
      });

      if (Array.isArray(dataProd)) {
        const hydratedProducts = dataProd.map((p) => {
          const agg = salesAggregates.get(p.id) || { totalQty: 0, totalVal: 0 };
          return {
            ...p,
            totalSalesQuantity: agg.totalQty,
            totalSalesValue: agg.totalVal,
          };
        });
        setAllProducts(hydratedProducts);
      }

      if (Array.isArray(dataMov)) {
        setAllMovements(dataMov);
      }

      if (Array.isArray(dataNFs)) {
        setAllNfEntries(dataNFs);
      }

      if (Array.isArray(dataUsers) && dataUsers.length > 0) {
        const mappedUsers: UserProfile[] = dataUsers.map((u: any) => {
          const role = (u.role || 'Operador Depósito/Loja') as UserRole;
          return {
            id: u.uid || `usr-${u.id}`,
            name: u.name || 'Usuário Fini',
            email: u.email,
            role,
            pin: u.pin || '',
            active: u.active ?? true,
            avatarUrl: role === 'super_admin' ? 'emoji:👑' : 'emoji:🍬',
            permissions: getRolePermissions(role),
          };
        });
        setAllUsers(mappedUsers);
      }

      const totalItems = (Array.isArray(dataProd) ? dataProd.length : 0) +
        (Array.isArray(dataNFs) ? dataNFs.length : 0) +
        (Array.isArray(dataMov) ? dataMov.length : 0);

      setCloudInfo({
        lastSyncTime: new Date().toISOString(),
        status: 'synced',
        backupSizeKB: totalItems > 0 ? Math.max(16, Math.round(totalItems * 1.5)) : 0,
        totalRecords: totalItems,
        autoSyncEnabled: true,
      });
    } catch (e: any) {
      console.warn('Aviso ao sincronizar dados com o servidor:', e?.message || e);
      setCloudInfo((prev) => ({ ...prev, status: 'error' }));
    } finally {
      setIsLoadingServer(false);
    }
  };

  useEffect(() => {
    fetchServerData();
  }, []);

  // Tenant Operations
  const setCurrentTenant = (tenantId: string) => {
    setCurrentTenantId(tenantId);
  };

  const addTenant = (tenantData: Omit<Tenant, 'id' | 'createdAt'>): Tenant => {
    const newTenant: Tenant = {
      ...tenantData,
      id: `tenant-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setTenants((prev) => [...prev, newTenant]);

    const starterProducts = getStarterProductsForTenant(newTenant);
    setAllProducts((prev) => [...starterProducts, ...prev]);

    return newTenant;
  };

  const updateTenant = (updatedTenant: Tenant) => {
    setTenants((prev) => prev.map((t) => (t.id === updatedTenant.id ? updatedTenant : t)));
  };

  const deleteTenant = (tenantId: string) => {
    if (tenants.length <= 1) return;
    setTenants((prev) => prev.filter((t) => t.id !== tenantId));
    setAllProducts((prev) => prev.filter((p) => p.tenantId !== tenantId));
    setAllNfEntries((prev) => prev.filter((n) => n.tenantId !== tenantId));
    setAllTransfers((prev) => prev.filter((t) => t.tenantId !== tenantId));
    setAllMovements((prev) => prev.filter((m) => m.tenantId !== tenantId));

    if (currentTenantId === tenantId) {
      const remaining = tenants.filter((t) => t.id !== tenantId);
      setCurrentTenantId(remaining[0].id);
    }
  };

  const openTenantModal = () => setIsTenantModalOpen(true);
  const closeTenantModal = () => setIsTenantModalOpen(false);

  // Category Operations
  const addCategory = (newCategoryName: string): boolean => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return false;
    const exists = categories.some((c) => c.toLowerCase() === trimmed.toLowerCase());
    if (exists) return false;
    setCategories((prev) => [...prev, trimmed]);
    return true;
  };

  // Low stock & Expiration Monitoring
  useEffect(() => {
    const newAlerts: AppNotification[] = [];
    const currentLowStockKeys = new Set<string>();

    products.forEach((p) => {
      // Low stock in Depósito
      if (p.stockDeposito <= p.minStockDeposito) {
        const key = `dep-${p.id}`;
        currentLowStockKeys.add(key);

        if (!notifiedLowStockRef.current.has(key)) {
          notifyLowStock(p.name, p.stockDeposito, p.minStockDeposito, 'Depósito', p.id);
        }

        newAlerts.push({
          id: `low-dep-${p.id}`,
          title: `Estoque Baixo no Depósito: ${p.name}`,
          message: `O estoque atual do depósito é de ${p.stockDeposito} ${p.unit} (Mínimo: ${p.minStockDeposito}).`,
          type: 'low_stock',
          severity: p.stockDeposito === 0 ? 'high' : 'medium',
          timestamp: new Date().toISOString(),
          read: false,
          productId: p.id,
          location: 'deposito',
        });
      }

      // Low stock in Loja
      if (p.stockLoja <= p.minStockLoja) {
        const key = `loj-${p.id}`;
        currentLowStockKeys.add(key);

        if (!notifiedLowStockRef.current.has(key)) {
          notifyLowStock(p.name, p.stockLoja, p.minStockLoja, 'Loja', p.id);
        }

        newAlerts.push({
          id: `low-loj-${p.id}`,
          title: `Estoque Baixo na Loja: ${p.name}`,
          message: `Apenas ${p.stockLoja} ${p.unit} na loja (Mínimo: ${p.minStockLoja}). Solicite transferência do depósito!`,
          type: 'low_stock',
          severity: p.stockLoja === 0 ? 'high' : 'medium',
          timestamp: new Date().toISOString(),
          read: false,
          productId: p.id,
          location: 'loja',
        });
      }

      // Expiration check
      const days = getDaysToExpiration(p.expirationDate);
      if (days < 0) {
        newAlerts.push({
          id: `exp-expired-${p.id}`,
          title: `PRODUTO VENCIDO: ${p.name}`,
          message: `Lote ${p.batchNumber} venceu em ${p.expirationDate}. Realize a baixa por perda/avaria imediatamente.`,
          type: 'expiration',
          severity: 'high',
          timestamp: new Date().toISOString(),
          read: false,
          productId: p.id,
        });
      } else if (days <= 30) {
        newAlerts.push({
          id: `exp-near-${p.id}`,
          title: `Atenção à Validade: ${p.name}`,
          message: `Vence em ${days} dias (${p.expirationDate}). Considere criar promoção na loja.`,
          type: 'expiration',
          severity: 'medium',
          timestamp: new Date().toISOString(),
          read: false,
          productId: p.id,
        });
      }
    });

    notifiedLowStockRef.current = currentLowStockKeys;
    setNotifications(newAlerts);
  }, [products]);

  const unreadNotificationCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  // Switch Role
  const setCurrentUserRole = (role: UserRole) => {
    const found = users.find((u) => u.role === role);
    if (found) setCurrentUser(found);
  };

  // Add Product with server Express API
  const addProduct = async (
    newP: Partial<Product> & Omit<Product, 'lastUpdated' | 'totalSalesQuantity' | 'totalSalesValue'> & { id?: string }
  ): Promise<Product> => {
    const createdId = newP.id || `p-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const eanVal = newP.ean || (newP as any).codeEAN || '';

    const created: Product = {
      ...newP,
      id: createdId,
      sku: newP.sku || `SKU-${Date.now().toString().slice(-6)}`,
      ean: eanVal,
      codeEAN: eanVal,
      name: newP.name || 'Novo Produto',
      category: newP.category || 'Balas de Gelatina',
      unit: newP.unit || 'Pacote 500g',
      stockDeposito: Number(newP.stockDeposito) || 0,
      stockLoja: Number(newP.stockLoja) || 0,
      minStockDeposito: Number(newP.minStockDeposito) || 15,
      minStockLoja: Number(newP.minStockLoja) || 5,
      costPrice: Number(newP.costPrice) || 10,
      sellPrice: Number(newP.sellPrice) || 20,
      expirationDate: newP.expirationDate || '2027-12-31',
      batchNumber: newP.batchNumber || `LOTE-${new Date().getFullYear()}`,
      lastUpdated: new Date().toISOString(),
      totalSalesQuantity: 0,
      totalSalesValue: 0,
    };

    setAllProducts((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);

    try {
      const response = await authFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(created),
      });

      if (!response.ok) {
        let errorMessage = `Erro ao salvar produto no servidor (HTTP ${response.status}).`;
        try {
          const errData = await response.json();
          if (errData?.error) errorMessage = errData.error;
        } catch {
          try {
            const errText = await response.text();
            if (errText) errorMessage = errText;
          } catch {}
        }

        if (response.status === 403) {
          handle403PermissionDenied('cadastrar produto');
        }

        setAllProducts((prev) => prev.filter((p) => p.id !== created.id));
        throw new Error(errorMessage);
      }
    } catch (e: any) {
      setAllProducts((prev) => prev.filter((p) => p.id !== created.id));
      console.error('Erro ao salvar produto via API:', e);
      throw e;
    }

    return created;
  };

  // Update Product with server Express API
  const updateProduct = async (id: string, updated: Partial<Product>) => {
    const targetProduct = allProducts.find((p) => p.id === id);
    if (!targetProduct) return;

    const previousProduct = { ...targetProduct };
    const newProd = {
      ...targetProduct,
      ...updated,
      lastUpdated: new Date().toISOString(),
    };

    setAllProducts((prev) => {
      const exists = prev.some((p) => p.id === id);
      if (exists) {
        return prev.map((p) => (p.id === id ? newProd : p));
      }
      return [newProd, ...prev];
    });

    try {
      const response = await authFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProd),
      });

      if (!response.ok) {
        let errorMessage = `Erro ao atualizar produto no servidor (HTTP ${response.status}).`;
        try {
          const errData = await response.json();
          if (errData?.error) errorMessage = errData.error;
        } catch {
          try {
            const errText = await response.text();
            if (errText) errorMessage = errText;
          } catch {}
        }

        if (response.status === 403) {
          handle403PermissionDenied('editar produto');
        }

        setAllProducts((prev) => prev.map((p) => (p.id === id ? previousProduct : p)));
        throw new Error(errorMessage);
      }
    } catch (e: any) {
      setAllProducts((prev) => prev.map((p) => (p.id === id ? previousProduct : p)));
      console.error('Erro ao atualizar produto via API:', e);
      throw e;
    }
  };

  // Delete Product with server Express API
  const deleteProduct = async (id: string) => {
    const previousProducts = [...allProducts];
    setAllProducts((prev) => prev.filter((p) => p.id !== id));

    try {
      const response = await authFetch(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' });

      if (!response.ok) {
        let errorMessage = `Erro ao excluir produto no servidor (HTTP ${response.status}).`;
        try {
          const errData = await response.json();
          if (errData?.error) errorMessage = errData.error;
        } catch {
          try {
            const errText = await response.text();
            if (errText) errorMessage = errText;
          } catch {}
        }

        if (response.status === 403) {
          handle403PermissionDenied('excluir produto');
        }

        setAllProducts(previousProducts);
        throw new Error(errorMessage);
      }
    } catch (e: any) {
      setAllProducts(previousProducts);
      console.error('Erro ao deletar produto via API:', e);
      throw e;
    }
  };

  // Add NF Entry with server Express API
  const addNFEntry = async (nfData: Omit<NFEntry, 'id' | 'receiveDate'>) => {
    const previousNFs = [...allNfEntries];
    const previousProducts = [...allProducts];
    const previousMovements = [...allMovements];

    const nowISO = new Date().toISOString();
    const newNF: NFEntry = {
      ...nfData,
      id: `nf-${Date.now()}`,
      receiveDate: nowISO.slice(0, 10),
    };

    setAllNfEntries((prev) => [newNF, ...prev]);

    let finalUpdatedProds: Product[] = [];

    setAllProducts((prevProducts) => {
      const updatedProdsList: Product[] = [];
      const matchedItemIds = new Set<string>();

      const nextProducts = prevProducts.map((p) => {
        const pEan = p.ean || p.codeEAN || '';
        const item = nfData.items.find(
          (i) =>
            i.productId === p.id ||
            (pEan && i.productId && pEan === i.productId) ||
            (p.sku && i.productId && p.sku === i.productId)
        );

        if (item) {
          matchedItemIds.add(item.productId);
          const addedQty = Number(item.quantity) || 0;
          const currentDepStock = Number(p.stockDeposito) || 0;
          const updated: Product = {
            ...p,
            stockDeposito: currentDepStock + addedQty,
            costPrice: Number(item.costPrice) > 0 ? Number(item.costPrice) : p.costPrice,
            batchNumber: item.batchNumber || p.batchNumber,
            expirationDate: item.expirationDate || p.expirationDate,
            lastUpdated: nowISO,
          };
          updatedProdsList.push(updated);
          return updated;
        }
        return p;
      });

      const missingItems = nfData.items.filter(
        (i) =>
          !matchedItemIds.has(i.productId) &&
          !nextProducts.some(
            (p) => p.id === i.productId || (p.ean && p.ean === i.productId) || (p.sku && p.sku === i.productId)
          )
      );

      if (missingItems.length > 0) {
        missingItems.forEach((i) => {
          const autoCreated: Product = {
            id: i.productId || `p-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            sku: `SKU-${Date.now().toString().slice(-6)}`,
            ean: '',
            codeEAN: '',
            name: i.productName || 'Produto Importado por NF',
            category: 'Balas de Gelatina',
            unit: 'Pacote 500g',
            stockDeposito: Number(i.quantity) || 0,
            stockLoja: 0,
            minStockDeposito: 15,
            minStockLoja: 5,
            costPrice: Number(i.costPrice) || 10,
            sellPrice: (Number(i.costPrice) || 10) * 1.8,
            expirationDate: i.expirationDate || '2027-12-31',
            batchNumber: i.batchNumber || `LOTE-${new Date().getFullYear()}`,
            lastUpdated: nowISO,
            totalSalesQuantity: 0,
            totalSalesValue: 0,
          };
          nextProducts.unshift(autoCreated);
          updatedProdsList.push(autoCreated);
        });
      }

      finalUpdatedProds = updatedProdsList;
      return nextProducts;
    });

    const newMovements: StockMovement[] = nfData.items.map((item) => ({
      id: `mov-${Date.now()}-${item.productId}`,
      date: nowISO,
      productId: item.productId,
      productName: item.productName,
      type: 'entrada_nf',
      quantity: Number(item.quantity) || 0,
      location: 'deposito',
      unitPrice: Number(item.costPrice) || 0,
      totalValue: Number(item.totalCost) || (Number(item.quantity) || 0) * (Number(item.costPrice) || 0),
      reason: `Nota Fiscal #${nfData.numberNF} (${nfData.supplier})`,
      userName: currentUser.name,
    }));

    setAllMovements((prev) => [...newMovements, ...prev]);

    notifyNewNFEntry(
      newNF.numberNF,
      newNF.supplier,
      newNF.items.length,
      newNF.totalValue
    );

    try {
      const response = await authFetch('/api/nf-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNF),
      });

      if (!response.ok) {
        let errorMessage = `Erro ao salvar NF no servidor (HTTP ${response.status}).`;
        try {
          const errData = await response.json();
          if (errData?.error) errorMessage = errData.error;
        } catch {
          try {
            const errText = await response.text();
            if (errText) errorMessage = errText;
          } catch {}
        }

        if (response.status === 403) {
          handle403PermissionDenied('lançar nota fiscal (NF)');
        }

        setAllNfEntries(previousNFs);
        setAllProducts(previousProducts);
        setAllMovements(previousMovements);
        throw new Error(errorMessage);
      }

      for (const p of finalUpdatedProds) {
        await authFetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p),
        });
      }

      for (const m of newMovements) {
        await authFetch('/api/movements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(m),
        });
      }
    } catch (e: any) {
      setAllNfEntries(previousNFs);
      setAllProducts(previousProducts);
      setAllMovements(previousMovements);
      console.error('Erro ao salvar NF via API:', e);
      throw e;
    }
  };

  // Transfer Stock from Depósito to Loja with server Express API
  const transferStock = async (productId: string, quantity: number, notes?: string) => {
    const product = allProducts.find((p) => p.id === productId);
    if (!product) return { success: false, message: 'Produto não encontrado neste estabelecimento.' };

    if (quantity <= 0) {
      return { success: false, message: 'Informe uma quantidade maior que zero.' };
    }

    if (product.stockDeposito < quantity) {
      return {
        success: false,
        message: `Saldo insuficiente no Depósito. Saldo atual do Depósito: ${product.stockDeposito} ${product.unit}.`,
      };
    }

    const previousProducts = [...allProducts];
    const nowISO = new Date().toISOString();
    const updatedProd: Product = {
      ...product,
      stockDeposito: product.stockDeposito - quantity,
      stockLoja: product.stockLoja + quantity,
      lastUpdated: nowISO,
    };

    setAllProducts((prev) => {
      const exists = prev.some((p) => p.id === productId);
      if (exists) {
        return prev.map((p) => (p.id === productId ? updatedProd : p));
      }
      return [updatedProd, ...prev];
    });

    const newTransfer: StockTransfer = {
      id: `trf-${Date.now()}`,
      date: nowISO,
      productId: product.id,
      productName: product.name,
      quantity,
      origin: 'deposito',
      destination: 'loja',
      operatorName: currentUser.name,
      notes,
      status: 'concluida',
    };

    setAllTransfers((prev) => [newTransfer, ...prev]);

    const newMovement: StockMovement = {
      id: `mov-${Date.now()}`,
      date: nowISO,
      productId: product.id,
      productName: product.name,
      type: 'transferencia_deposito_loja',
      quantity,
      location: 'ambos',
      reason: notes || 'Transferência Depósito ➔ Loja',
      userName: currentUser.name,
    };

    setAllMovements((prev) => [newMovement, ...prev]);

    try {
      const movRes = await authFetch('/api/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMovement),
      });

      if (!movRes.ok) {
        let errorMessage = `Erro ao salvar transferência no servidor (HTTP ${movRes.status}).`;
        try {
          const errData = await movRes.json();
          if (errData?.error) errorMessage = errData.error;
        } catch {
          try {
            const errText = await movRes.text();
            if (errText) errorMessage = errText;
          } catch {}
        }

        if (movRes.status === 403) {
          handle403PermissionDenied('transferir estoque');
        }

        setAllProducts(previousProducts);
        setAllTransfers((prev) => prev.filter((t) => t.id !== newTransfer.id));
        setAllMovements((prev) => prev.filter((m) => m.id !== newMovement.id));
        return {
          success: false,
          message: errorMessage,
        };
      }

      const prodRes = await authFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProd),
      });

      if (!prodRes.ok) {
        let errorMessage = `Erro ao atualizar estoque na transferência (HTTP ${prodRes.status}).`;
        try {
          const errData = await prodRes.json();
          if (errData?.error) errorMessage = errData.error;
        } catch {
          try {
            const errText = await prodRes.text();
            if (errText) errorMessage = errText;
          } catch {}
        }

        setAllProducts(previousProducts);
        setAllTransfers((prev) => prev.filter((t) => t.id !== newTransfer.id));
        setAllMovements((prev) => prev.filter((m) => m.id !== newMovement.id));
        return {
          success: false,
          message: errorMessage,
        };
      }
    } catch (e: any) {
      setAllProducts(previousProducts);
      setAllTransfers((prev) => prev.filter((t) => t.id !== newTransfer.id));
      setAllMovements((prev) => prev.filter((m) => m.id !== newMovement.id));
      console.error('Erro ao salvar transferência via API:', e);
      return {
        success: false,
        message: e?.message || 'Erro ao comunicar com o servidor.',
      };
    }

    return {
      success: true,
      message: `Transferência de ${quantity}x "${product.name}" do Depósito para a Loja realizada com sucesso!`,
    };
  };

  // Register Movement (Sale, Loss, Adjustment) with server Express API
  const registerMovement = async (
    productId: string,
    type: StockMovement['type'],
    quantity: number,
    location: 'loja' | 'deposito' | 'ambos',
    reason?: string,
    unitPrice?: number
  ) => {
    const product = allProducts.find((p) => p.id === productId);
    if (!product || quantity <= 0) return;

    const previousProducts = [...allProducts];
    const previousMovements = [...allMovements];
    const nowISO = new Date().toISOString();
    const price = unitPrice ?? (type === 'venda_loja' ? product.sellPrice : product.costPrice);
    const totalVal = price * quantity;

    let newStockDep = product.stockDeposito;
    let newStockLoj = product.stockLoja;
    let newSalesQty = product.totalSalesQuantity;
    let newSalesVal = product.totalSalesValue;

    if (type === 'venda_loja') {
      newStockLoj = Math.max(0, product.stockLoja - quantity);
      newSalesQty += quantity;
      newSalesVal += totalVal;
    } else if (type === 'perda_avaria') {
      if (location === 'loja') newStockLoj = Math.max(0, product.stockLoja - quantity);
      else newStockDep = Math.max(0, product.stockDeposito - quantity);
    } else if (type === 'ajuste_inventario') {
      if (location === 'loja') newStockLoj = quantity;
      else if (location === 'deposito') newStockDep = quantity;
    }

    const updatedProd: Product = {
      ...product,
      stockDeposito: newStockDep,
      stockLoja: newStockLoj,
      totalSalesQuantity: newSalesQty,
      totalSalesValue: newSalesVal,
      lastUpdated: nowISO,
    };

    setAllProducts((prev) => {
      const exists = prev.some((p) => p.id === productId);
      if (exists) {
        return prev.map((p) => (p.id === productId ? updatedProd : p));
      }
      return [updatedProd, ...prev];
    });

    const newMov: StockMovement = {
      id: `mov-${Date.now()}`,
      date: nowISO,
      productId: product.id,
      productName: product.name,
      type,
      quantity,
      location,
      unitPrice: price,
      totalValue: totalVal,
      reason,
      userName: currentUser.name,
    };

    setAllMovements((prev) => [newMov, ...prev]);

    try {
      const movRes = await authFetch('/api/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMov),
      });

      if (!movRes.ok) {
        let errorMessage = `Erro ao salvar movimentação no servidor (HTTP ${movRes.status}).`;
        try {
          const errData = await movRes.json();
          if (errData?.error) errorMessage = errData.error;
        } catch {
          try {
            const errText = await movRes.text();
            if (errText) errorMessage = errText;
          } catch {}
        }

        if (movRes.status === 403) {
          handle403PermissionDenied('registrar movimentação');
        }

        setAllProducts(previousProducts);
        setAllMovements(previousMovements);
        throw new Error(errorMessage);
      }

      const prodRes = await authFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProd),
      });

      if (!prodRes.ok) {
        let errorMessage = `Erro ao atualizar estoque da movimentação (HTTP ${prodRes.status}).`;
        try {
          const errData = await prodRes.json();
          if (errData?.error) errorMessage = errData.error;
        } catch {
          try {
            const errText = await prodRes.text();
            if (errText) errorMessage = errText;
          } catch {}
        }

        setAllProducts(previousProducts);
        setAllMovements(previousMovements);
        throw new Error(errorMessage);
      }

      if (type === 'venda_loja') {
        const saleRes = await authFetch('/api/sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: `sale-${Date.now()}`,
            productId: product.id,
            productName: product.name,
            quantity,
            unitPrice: price,
            totalAmount: totalVal,
            paymentMethod: 'PIX',
            sellerName: currentUser.name,
            timestamp: nowISO,
          }),
        });

        if (!saleRes.ok) {
          let errorMessage = `Erro ao registrar venda (HTTP ${saleRes.status}).`;
          try {
            const errData = await saleRes.json();
            if (errData?.error) errorMessage = errData.error;
          } catch {}

          if (saleRes.status === 403) {
            handle403PermissionDenied('registrar venda');
          }
          console.warn('Aviso ao registrar venda detalhada:', errorMessage);
        }
      }
    } catch (e: any) {
      setAllProducts(previousProducts);
      setAllMovements(previousMovements);
      console.error('Erro ao salvar movimentação via API:', e);
      throw e;
    }
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const triggerCloudSync = async () => {
    await fetchServerData();
  };

  const exportBackupJSON = () => {
    const backupData = {
      app: 'Fini ERP Multi-tenant System',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      tenant: currentTenant,
      products,
      nfEntries,
      transfers,
      movements,
      users,
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `backup_fini_${currentTenant.code}_${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const importBackupJSON = (jsonData: string): boolean => {
    try {
      const parsed = JSON.parse(jsonData);
      if (parsed.products && Array.isArray(parsed.products)) {
        setAllProducts(parsed.products);
        if (parsed.nfEntries) setAllNfEntries(parsed.nfEntries);
        if (parsed.transfers) setAllTransfers(parsed.transfers);
        if (parsed.movements) setAllMovements(parsed.movements);
        triggerCloudSync();
        return true;
      }
      return false;
    } catch (e) {
      console.error('Error importing backup JSON:', e);
      return false;
    }
  };

  const resetToDefaultData = async () => {
    setAllProducts(INITIAL_PRODUCTS);
    setAllNfEntries(INITIAL_NF_ENTRIES);
    setAllTransfers(INITIAL_TRANSFERS);
    setAllMovements(INITIAL_MOVEMENTS);
    setAllUsers(INITIAL_USERS);
    await fetchServerData();
  };

  const verifyAdminPin = (pin: string): boolean => {
    if (!pin) return false;
    return allUsers.some((u) => (u.role === 'admin' || u.role === 'super_admin') && u.active && u.pin === pin);
  };

  const wipeSystemData = async (pin?: string) => {
    const response = await authFetch('/api/system/wipe', {
      method: 'DELETE',
      body: JSON.stringify({ pin: pin || '' }),
    });

    if (!response.ok) {
      const errData = await safeParseJson<{ error?: string }>(response);
      throw new Error(errData?.error || `Erro HTTP ${response.status} ao zerar dados do sistema.`);
    }

    setAllProducts([]);
    setAllNfEntries([]);
    setAllTransfers([]);
    setAllMovements([]);
    setNotifications([]);
    setCloudInfo((prev) => ({
      ...prev,
      totalRecords: 0,
      backupSizeKB: 0,
      lastSyncTime: new Date().toISOString(),
      status: 'synced',
    }));
  };

  return (
    <StockContext.Provider
      value={{
        products,
        categories,
        nfEntries,
        transfers,
        movements,
        users,
        allUsers,
        currentUser,
        isAuthenticated,
        isAuthModalOpen,
        isAuthChecking,
        activeLocation,
        notifications,
        cloudInfo,
        unreadNotificationCount,
        isLoadingCloudSql: isLoadingServer,
        isLoadingSupabase: isLoadingServer,
        tenants,
        currentTenant,
        isTenantModalOpen,
        setCurrentTenantId: setCurrentTenant,
        addTenant,
        updateTenant,
        deleteTenant,
        openTenantModal,
        closeTenantModal,
        setActiveLocation,
        setCurrentUserRole,
        loginWithPin,
        loginWithGoogleAccount,
        logoutAndLock,
        openSwitchUserModal,
        closeAuthModal,
        updateUser,
        addUser,
        deleteUser,
        checkPermission,
        addCategory,
        addProduct,
        updateProduct,
        deleteProduct,
        addNFEntry,
        transferStock,
        registerMovement,
        markNotificationRead,
        markAllNotificationsRead,
        triggerCloudSync,
        exportBackupJSON,
        importBackupJSON,
        resetToDefaultData,
        wipeSystemData,
        verifyAdminPin,
      }}
    >
      {children}
    </StockContext.Provider>
  );
};

export function useStock() {
  const context = useContext(StockContext);
  if (!context) {
    throw new Error('useStock must be used within a StockProvider');
  }
  return context;
}
