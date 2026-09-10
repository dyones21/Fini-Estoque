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
  CompanyInfo,
  Role,
} from '../types';
import {
  INITIAL_PRODUCTS,
  INITIAL_NF_ENTRIES,
  INITIAL_TRANSFERS,
  INITIAL_MOVEMENTS,
  INITIAL_USERS,
} from '../data/initialData';
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
  isLoadingUsers: boolean;
  isLoadingCompany: boolean;

  // Company Info
  companyInfo: CompanyInfo;
  updateCompanyInfo: (info: Partial<CompanyInfo>) => Promise<CompanyInfo>;

  // Actions & Auth
  setActiveLocation: (loc: LocationType) => void;
  setCurrentUserRole: (role: UserRole) => void;
  loginWithPin: (userId: string, pin: string) => boolean;
  loginWithGoogleAccount: () => Promise<{ success: boolean; redirected?: boolean }>;
  logoutAndLock: () => void;
  openSwitchUserModal: () => void;
  closeAuthModal: () => void;
  updateUser: (user: UserProfile) => Promise<void>;
  addUser: (user: UserProfile) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  checkPermission: (permissionKey: keyof UserPermissions) => boolean;

  // Category Operations
  addCategory: (newCategoryName: string) => Promise<boolean>;

  // Product Operations
  addProduct: (product: Omit<Product, 'id' | 'lastUpdated' | 'totalSalesQuantity' | 'totalSalesValue'> & { id?: string }) => Promise<Product>;
  updateProduct: (id: string, product: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  // Inventory Operations
  addNFEntry: (nf: Omit<NFEntry, 'id' | 'receiveDate'>) => Promise<void>;
  deleteNFEntry: (id: string) => Promise<{ success: boolean; message: string }>;
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

  // Roles Management (Dynamic RBAC)
  roles: Role[];
  isLoadingRoles: boolean;
  fetchRoles: () => Promise<Role[]>;
  createRole: (roleData: Omit<Role, 'id' | 'createdAt' | 'isSystemRole' | 'userCount'>) => Promise<Role>;
  updateRole: (id: string, roleData: Partial<Role>) => Promise<Role>;
  deleteRole: (id: string) => Promise<void>;

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

export const StockProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Company Info State (strictly single-tenant from PostgreSQL)
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    id: 'default-company',
    name: '',
    tradeName: '',
    cnpj: '',
    address: '',
    city: '',
    state: '',
    defaultMarkupPercent: 85,
    isConfigured: false,
    active: true,
    isMaster: true,
  });
  const [isLoadingCompany, setIsLoadingCompany] = useState<boolean>(true);

  // Categories State (loaded strictly from PostgreSQL /api/categories)
  const [categories, setCategories] = useState<string[]>([]);

  // Users State (loaded strictly from PostgreSQL /api/users)
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(true);

  // Roles State (loaded strictly from PostgreSQL /api/roles)
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState<boolean>(true);

  // Current logged in user (strictly set via auth / handleUserAuthenticated)
  const [currentUser, setCurrentUser] = useState<UserProfile>({
    id: '',
    name: '',
    email: '',
    role: 'operador_deposito',
    pin: '',
    permissions: getRolePermissions('operador_deposito'),
    active: true,
  });

  // Product and inventory data states (populated exclusively from PostgreSQL server)
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

  const products = useMemo(
    () => [...allProducts].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [allProducts]
  );
  const nfEntries = useMemo(() => allNfEntries, [allNfEntries]);
  const transfers = useMemo(() => allTransfers, [allTransfers]);
  const movements = useMemo(() => allMovements, [allMovements]);
  const users = useMemo(() => allUsers, [allUsers]);

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
    }
  }, [allUsers, currentUser?.id, currentUser?.email, currentUser?.role, currentUser?.name, currentUser?.active, currentUser?.permissions]);

  // Helper de notificação para acessos bloqueados por falta de permissão (HTTP 403)
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
    const name = localUser?.name || userPayload.displayName || email.split('@')[0] || 'Usuário GummyStock';

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

  // Listener para Firebase Auth com suporte à persistência de sessão local
  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isMounted) return;

      if (firebaseUser) {
        try {
          await handleUserAuthenticated({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
          });
        } catch (err) {
          console.warn('Erro ao processar usuário autenticado:', err);
        } finally {
          if (isMounted) {
            setIsAuthChecking(false);
          }
        }
      } else {
        if (isMounted) {
          setIsAuthenticated(false);
          setIsAuthModalOpen(true);
          setIsAuthChecking(false);
        }
      }
    });

    return () => {
      isMounted = false;
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
    if (!currentUser) return false;
    if (
      currentUser.isSystemRole ||
      currentUser.role === 'ADMIN' ||
      currentUser.role === 'super_admin' ||
      currentUser.role === 'admin' ||
      (currentUser.email && currentUser.email.toLowerCase() === 'dyones21@gmail.com')
    ) {
      return true;
    }
    return Boolean(currentUser.permissions?.[permissionKey]);
  };

  // Fetch roles directly from Express backend
  const fetchRoles = async (): Promise<Role[]> => {
    try {
      setIsLoadingRoles(true);
      const res = await authFetch('/api/roles');
      if (res.ok) {
        const data = await safeParseJson<Role[]>(res);
        if (Array.isArray(data)) {
          setRoles(data);
          return data;
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar lista de cargos:', err);
    } finally {
      setIsLoadingRoles(false);
    }
    return roles;
  };

  const createRole = async (
    roleData: Omit<Role, 'id' | 'createdAt' | 'isSystemRole' | 'userCount'>
  ): Promise<Role> => {
    const res = await authFetch('/api/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roleData),
    });

    if (!res.ok) {
      if (res.status === 403) {
        handle403PermissionDenied('Criar Cargo no Sistema');
        throw new Error('Apenas o Administrador fixo do sistema (ADMIN) pode criar novos cargos.');
      }
      const errData = await safeParseJson<{ error?: string }>(res);
      throw new Error(errData?.error || `Erro HTTP ${res.status} ao criar cargo.`);
    }

    const created = await safeParseJson<Role>(res);
    if (!created) {
      throw new Error('Resposta inválida do servidor ao criar cargo.');
    }

    setRoles((prev) => [...prev, created]);
    return created;
  };

  const updateRole = async (id: string, roleData: Partial<Role>): Promise<Role> => {
    const res = await authFetch(`/api/roles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roleData),
    });

    if (!res.ok) {
      if (res.status === 403) {
        handle403PermissionDenied('Editar Cargo no Sistema');
        throw new Error('Apenas o Administrador fixo do sistema (ADMIN) pode alterar permissões de cargos.');
      }
      const errData = await safeParseJson<{ error?: string }>(res);
      throw new Error(errData?.error || `Erro HTTP ${res.status} ao atualizar cargo.`);
    }

    const updated = await safeParseJson<Role>(res);
    if (!updated) {
      throw new Error('Resposta inválida do servidor ao atualizar cargo.');
    }

    setRoles((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
    // Atualiza também os usuários locais com as novas permissões
    await fetchServerData();
    return updated;
  };

  const deleteRole = async (id: string): Promise<void> => {
    const res = await authFetch(`/api/roles/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      if (res.status === 403) {
        handle403PermissionDenied('Excluir Cargo do Sistema');
        throw new Error('Apenas o Administrador fixo do sistema (ADMIN) pode excluir cargos.');
      }
      const errData = await safeParseJson<{ error?: string }>(res);
      throw new Error(errData?.error || `Erro HTTP ${res.status} ao excluir cargo.`);
    }

    setRoles((prev) => prev.filter((r) => r.id !== id));
  };

  // Fetch initial data exclusively through Express Server API routes (/api/...)
  const fetchServerData = async () => {
    setIsLoadingServer(true);
    try {
      setCloudInfo((prev) => ({ ...prev, status: 'syncing' }));

      const [resProd, resMov, resNFs, resSales, resUsers, resComp, resCats, resRoles] = await Promise.all([
        authFetch('/api/products').catch(() => null),
        authFetch('/api/movements').catch(() => null),
        authFetch('/api/nf-entries').catch(() => null),
        authFetch('/api/sales').catch(() => null),
        authFetch('/api/users').catch(() => null),
        authFetch('/api/company').catch(() => null),
        authFetch('/api/categories').catch(() => null),
        authFetch('/api/roles').catch(() => null),
      ]);

      let loadedProducts: Product[] = [];
      let loadedMovements: StockMovement[] = [];
      let loadedNFs: NFEntry[] = [];
      let loadedUsers: any[] = [];
      let loadedSales: any[] = [];

      const [dataProd, dataMov, dataNFs, dataSales, dataUsers, dataComp, dataCats, dataRoles] = await Promise.all([
        safeParseJson(resProd),
        safeParseJson(resMov),
        safeParseJson(resNFs),
        safeParseJson(resSales),
        safeParseJson(resUsers),
        safeParseJson(resComp),
        safeParseJson(resCats),
        safeParseJson(resRoles),
      ]);

      if (dataComp && typeof dataComp === 'object') {
        setCompanyInfo({
          id: dataComp.id || 'default-company',
          name: dataComp.name || '',
          tradeName: dataComp.tradeName || '',
          cnpj: dataComp.cnpj || '',
          address: dataComp.address || '',
          city: dataComp.city || '',
          state: dataComp.state || 'RJ',
          defaultMarkupPercent:
            dataComp.defaultMarkupPercent !== undefined && dataComp.defaultMarkupPercent !== null
              ? Number(dataComp.defaultMarkupPercent)
              : 85,
          isConfigured: Boolean(dataComp.isConfigured || (dataComp.name && dataComp.cnpj)),
          active: dataComp.active ?? true,
          isMaster: true,
        });
      }
      setIsLoadingCompany(false);

      if (Array.isArray(dataCats)) {
        setCategories(dataCats);
      }

      if (Array.isArray(dataRoles)) {
        setRoles(dataRoles);
      }
      setIsLoadingRoles(false);

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
        const reconstructedTransfers: StockTransfer[] = dataMov
          .filter((m: any) => m.type === 'transferencia_deposito_loja' || m.type === 'Transferência Interna')
          .map((m: any) => ({
            id: m.id.replace(/^mov-/, ''),
            productId: m.productId,
            productName: m.productName,
            quantity: m.quantity,
            date: m.date,
            origin: 'deposito',
            destination: 'loja',
            operatorName: m.userName || 'Operador',
            status: 'concluida',
            notes: m.reason?.startsWith('Transferência:') ? m.reason.replace('Transferência:', '').trim() : undefined,
          }));
        setAllTransfers(reconstructedTransfers);
      }

      if (Array.isArray(dataNFs)) {
        setAllNfEntries(dataNFs);
      }

      if (Array.isArray(dataUsers)) {
        const mappedUsers: UserProfile[] = dataUsers.map((u: any) => {
          const role = (u.role || 'Operador Depósito/Loja') as UserRole;
          const isSys = Boolean(u.isSystemRole || role === 'super_admin' || role === 'ADMIN' || u.roleId === 'role_admin');
          return {
            id: u.uid || `usr-${u.id}`,
            name: u.name || 'Usuário GummyStock',
            email: u.email,
            role,
            roleId: u.roleId,
            isSystemRole: isSys,
            pin: u.pin || '',
            active: u.active ?? true,
            avatarUrl: isSys ? 'emoji:👑' : 'emoji:🍬',
            permissions: u.permissions || getRolePermissions(role),
          };
        });
        setAllUsers(mappedUsers);
      }
      setIsLoadingUsers(false);

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
      setIsLoadingUsers(false);
      setIsLoadingCompany(false);
    }
  };

  const updateCompanyInfo = async (info: Partial<CompanyInfo>): Promise<CompanyInfo> => {
    const res = await authFetch('/api/company', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(info),
    });

    if (!res.ok) {
      let msg = 'Erro ao salvar dados da empresa no servidor.';
      try {
        const errData = await res.json();
        if (errData?.error) msg = errData.error;
      } catch {}
      throw new Error(msg);
    }

    const savedCompany: CompanyInfo = await res.json();
    setCompanyInfo(savedCompany);
    return savedCompany;
  };

  // Category Operations (persisted directly to Postgres /api/categories)
  const addCategory = async (newCategoryName: string): Promise<boolean> => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return false;
    try {
      const res = await authFetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        setCategories((prev) => {
          if (prev.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return prev;
          return [...prev, trimmed].sort();
        });
        return true;
      }
    } catch (e) {
      console.error('Error adding category to server:', e);
    }
    return false;
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
          severity: 'high',
          timestamp: new Date().toISOString(),
          productId: p.id,
          read: false,
        });
      }

      // Low stock in Loja
      if (p.stockLoja <= p.minStockLoja) {
        const key = `loja-${p.id}`;
        currentLowStockKeys.add(key);

        if (!notifiedLowStockRef.current.has(key)) {
          notifyLowStock(p.name, p.stockLoja, p.minStockLoja, 'Loja', p.id);
        }

        newAlerts.push({
          id: `low-loja-${p.id}`,
          title: `Estoque Baixo na Loja: ${p.name}`,
          message: `O estoque atual da loja é de ${p.stockLoja} ${p.unit} (Mínimo: ${p.minStockLoja}).`,
          type: 'low_stock',
          severity: p.stockLoja === 0 ? 'high' : 'medium',
          timestamp: new Date().toISOString(),
          productId: p.id,
          read: false,
        });
      }

      // Expiration Alert
      if (p.expirationDate) {
        const daysTo = getDaysToExpiration(p.expirationDate);
        if (daysTo <= 30) {
          newAlerts.push({
            id: `exp-${p.id}`,
            title: `Validade Próxima: ${p.name}`,
            message:
              daysTo < 0
                ? `PRODUTO VENCIDO há ${Math.abs(daysTo)} dias (${p.expirationDate}). Lote: ${p.batchNumber || 'N/A'}`
                : `Vence em ${daysTo} dias (${p.expirationDate}). Lote: ${p.batchNumber || 'N/A'}`,
            type: 'expiration',
            severity: daysTo <= 7 ? 'high' : 'medium',
            timestamp: new Date().toISOString(),
            productId: p.id,
            read: false,
          });
        }
      }
    });

    notifiedLowStockRef.current = currentLowStockKeys;

    setNotifications((prev) => {
      const existingIds = new Set(prev.map((n) => n.id));
      const filteredNew = newAlerts.filter((n) => !existingIds.has(n.id));
      return [...filteredNew, ...prev].slice(0, 50);
    });
  }, [products]);

  const unreadNotificationCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  const setCurrentUserRole = (role: UserRole) => {
    setCurrentUser((prev) => ({
      ...prev,
      role,
      permissions: getRolePermissions(role),
    }));
  };

  const addProduct = async (
    productData: Omit<Product, 'id' | 'lastUpdated' | 'totalSalesQuantity' | 'totalSalesValue'> & { id?: string }
  ): Promise<Product> => {
    const newProduct: Product = {
      ...productData,
      id: productData.id || `p-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      lastUpdated: new Date().toISOString(),
      totalSalesQuantity: 0,
      totalSalesValue: 0,
    };

    setAllProducts((prev) => [newProduct, ...prev]);

    try {
      const response = await authFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct),
      });

      if (!response.ok) {
        if (response.status === 403) {
          handle403PermissionDenied('Cadastrar Novo Produto');
          setAllProducts((prev) => prev.filter((p) => p.id !== newProduct.id));
          throw new Error('Você não tem permissão para cadastrar novos produtos no estoque.');
        }
        const errData = await safeParseJson<{ error?: string }>(response);
        throw new Error(errData?.error || `Erro HTTP ${response.status} ao salvar produto no servidor.`);
      }

      const saved = await safeParseJson<Product>(response);
      return saved || newProduct;
    } catch (error) {
      console.error('Falha ao sincronizar novo produto com o servidor PostgreSQL:', error);
      throw error;
    }
  };

  const updateProduct = async (id: string, updatedFields: Partial<Product>) => {
    const prevProducts = [...allProducts];
    setAllProducts((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            ...updatedFields,
            lastUpdated: new Date().toISOString(),
          };
        }
        return p;
      })
    );

    try {
      const response = await authFetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updatedFields,
          lastUpdated: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          handle403PermissionDenied('Editar Dados do Produto');
          setAllProducts(prevProducts);
          throw new Error('Você não tem permissão para editar dados de produtos.');
        }
        const errData = await safeParseJson<{ error?: string }>(response);
        throw new Error(errData?.error || `Erro HTTP ${response.status} ao atualizar produto no servidor.`);
      }
    } catch (error) {
      setAllProducts(prevProducts);
      console.error('Falha ao atualizar produto no servidor PostgreSQL:', error);
      throw error;
    }
  };

  const deleteProduct = async (id: string) => {
    const prevProducts = [...allProducts];
    setAllProducts((prev) => prev.filter((p) => p.id !== id));

    try {
      const response = await authFetch(`/api/products/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        if (response.status === 403) {
          handle403PermissionDenied('Excluir Produto');
          setAllProducts(prevProducts);
          throw new Error('Você não tem permissão para excluir produtos do catálogo.');
        }
        const errData = await safeParseJson<{ error?: string }>(response);
        throw new Error(errData?.error || `Erro HTTP ${response.status} ao excluir produto no servidor.`);
      }
    } catch (error) {
      setAllProducts(prevProducts);
      console.error('Falha ao deletar produto do servidor PostgreSQL:', error);
      throw error;
    }
  };

  const addNFEntry = async (nfData: Omit<NFEntry, 'id' | 'receiveDate'>) => {
    const newEntry: NFEntry = {
      ...nfData,
      id: `nf-${Date.now()}`,
      receiveDate: new Date().toISOString().slice(0, 10),
    };

    // Salva estados anteriores para rollback em caso de falha
    const prevNfEntries = [...allNfEntries];
    const prevProducts = [...allProducts];
    const prevMovements = [...allMovements];

    // Atualização otimista imediata na interface
    setAllNfEntries((prev) => [newEntry, ...prev]);

    setAllProducts((prev) =>
      prev.map((p) => {
        const item = newEntry.items.find((i) => i.productId === p.id);
        if (item) {
          return {
            ...p,
            stockDeposito: p.stockDeposito + item.quantity,
            costPrice: item.costPrice > 0 ? item.costPrice : p.costPrice,
            lastUpdated: new Date().toISOString(),
          };
        }
        return p;
      })
    );

    const newMovements: StockMovement[] = newEntry.items.map((item) => ({
      id: `mov-nf-${newEntry.id}-${item.productId}-${Date.now()}`,
      productId: item.productId,
      productName: item.productName,
      type: 'entrada_nf',
      quantity: item.quantity,
      location: 'deposito',
      date: newEntry.receiveDate || new Date().toISOString(),
      userName: currentUser.name,
      reason: `Entrada por NF ${newEntry.numberNF} (${newEntry.supplier})`,
      unitPrice: item.costPrice,
      nfEntryId: newEntry.id,
    }));

    setAllMovements((prev) => [...newMovements, ...prev]);

    try {
      const response = await authFetch('/api/nf-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry),
      });

      if (!response.ok) {
        // Rollback dos estados locais
        setAllNfEntries(prevNfEntries);
        setAllProducts(prevProducts);
        setAllMovements(prevMovements);

        if (response.status === 403) {
          handle403PermissionDenied('Dar Entrada em Nota Fiscal');
          throw new Error('Você não tem permissão para lançar notas fiscais de entrada.');
        }
        const errData = await safeParseJson<{ error?: string }>(response);
        throw new Error(errData?.error || `Erro HTTP ${response.status} ao registrar NF no servidor.`);
      }

      // Re-sincroniza com os dados oficiais salvos e confirmados no banco de dados
      await fetchServerData();

      await notifyNewNFEntry(
        newEntry.numberNF,
        newEntry.supplier,
        newEntry.items.reduce((acc, i) => acc + i.quantity, 0),
        newEntry.totalValue
      );
    } catch (error) {
      // Garante rollback em caso de falha de rede ou exceção
      setAllNfEntries(prevNfEntries);
      setAllProducts(prevProducts);
      setAllMovements(prevMovements);
      console.error('Falha ao sincronizar entrada de NF no servidor PostgreSQL:', error);
      throw error;
    }
  };

  const deleteNFEntry = async (id: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await authFetch(`/api/nf-entries/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        if (response.status === 403) {
          handle403PermissionDenied('Excluir Nota Fiscal');
          throw new Error('Você não tem permissão para excluir notas fiscais.');
        }
        const errData = await safeParseJson<{ error?: string }>(response);
        throw new Error(errData?.error || `Erro HTTP ${response.status} ao excluir Nota Fiscal.`);
      }

      const result = await safeParseJson<{ success: boolean; message: string }>(response);

      setAllNfEntries((prev) => prev.filter((nf) => nf.id !== id));
      setAllMovements((prev) => prev.filter((m) => m.nfEntryId !== id));

      await fetchServerData();

      return {
        success: true,
        message: result?.message || 'Nota Fiscal excluída e estoque revertido com sucesso.',
      };
    } catch (error) {
      console.error('Erro ao excluir Nota Fiscal:', error);
      throw error;
    }
  };

  const transferStock = async (
    productId: string,
    quantity: number,
    notes?: string
  ): Promise<{ success: boolean; message: string }> => {
    const product = allProducts.find((p) => p.id === productId);
    if (!product) {
      return { success: false, message: 'Produto não localizado no estoque.' };
    }

    if (product.stockDeposito < quantity) {
      return {
        success: false,
        message: `Estoque insuficiente no Depósito. Disponível: ${product.stockDeposito} ${product.unit}.`,
      };
    }

    const prevProducts = allProducts;
    const prevTransfers = allTransfers;
    const prevMovements = allMovements;

    const newTransfer: StockTransfer = {
      id: `transf-${Date.now()}`,
      productId,
      productName: product.name,
      quantity,
      date: new Date().toISOString(),
      origin: 'deposito',
      destination: 'loja',
      operatorName: currentUser.name,
      status: 'concluida',
      notes,
    };

    const newMovement: StockMovement = {
      id: `mov-transf-${Date.now()}`,
      productId,
      productName: product.name,
      type: 'transferencia_deposito_loja',
      quantity,
      location: 'ambos',
      date: new Date().toISOString(),
      userName: currentUser.name,
      reason: `Transferência Depósito ➔ Loja: ${quantity} ${product.unit}${notes ? ` (${notes})` : ''}`,
      unitPrice: product.sellPrice,
    };

    setAllTransfers((prev) => [newTransfer, ...prev]);
    setAllMovements((prev) => [newMovement, ...prev]);

    setAllProducts((prev) =>
      prev.map((p) => {
        if (p.id === productId) {
          return {
            ...p,
            stockDeposito: p.stockDeposito - quantity,
            stockLoja: p.stockLoja + quantity,
            lastUpdated: new Date().toISOString(),
          };
        }
        return p;
      })
    );

    try {
      const response = await authFetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTransfer),
      });

      if (!response.ok) {
        if (response.status === 403) {
          handle403PermissionDenied('Transferência Depósito ➔ Loja');
          throw new Error('Você não tem permissão para realizar transferências de estoque.');
        }
        const errData = await safeParseJson<{ error?: string }>(response);
        throw new Error(errData?.error || `Erro HTTP ${response.status} ao registrar transferência no servidor.`);
      }

      const result = await safeParseJson<any>(response);
      if (result?.updatedProduct) {
        setAllProducts((prev) =>
          prev.map((p) => (p.id === productId ? { ...p, ...result.updatedProduct } : p))
        );
      }

      return {
        success: true,
        message: `Transferência de ${quantity} ${product.unit} de "${product.name}" para a Loja realizada com sucesso!`,
      };
    } catch (error: any) {
      console.error('Falha ao sincronizar transferência no servidor PostgreSQL:', error);
      // Revert optimistic updates
      setAllProducts(prevProducts);
      setAllTransfers(prevTransfers);
      setAllMovements(prevMovements);

      return {
        success: false,
        message: error?.message || 'Falha ao processar transferência no servidor.',
      };
    }
  };

  const registerMovement = async (
    productId: string,
    type: StockMovement['type'],
    quantity: number,
    location: 'loja' | 'deposito' | 'ambos',
    reason?: string,
    unitPrice?: number
  ) => {
    const product = allProducts.find((p) => p.id === productId);
    if (!product) return;

    const newMov: StockMovement = {
      id: `mov-${Date.now()}`,
      productId,
      productName: product.name,
      type,
      quantity,
      location,
      date: new Date().toISOString(),
      userName: currentUser.name,
      reason: reason || `Movimentação avulsa: ${type}`,
      unitPrice: unitPrice !== undefined ? unitPrice : product.sellPrice,
    };

    setAllMovements((prev) => [newMov, ...prev]);

    setAllProducts((prev) =>
      prev.map((p) => {
        if (p.id === productId) {
          let newDeposito = p.stockDeposito;
          let newLoja = p.stockLoja;

          if (type === 'venda_loja') {
            newLoja = Math.max(0, newLoja - quantity);
          } else if (type === 'perda_avaria') {
            if (location === 'deposito' || location === 'ambos') {
              newDeposito = Math.max(0, newDeposito - quantity);
            }
            if (location === 'loja') {
              newLoja = Math.max(0, newLoja - quantity);
            }
          } else if (type === 'ajuste_inventario') {
            if (location === 'deposito') newDeposito = quantity;
            if (location === 'loja') newLoja = quantity;
          } else if (type === 'transferencia_deposito_loja') {
            newDeposito = Math.max(0, newDeposito - quantity);
            newLoja = newLoja + quantity;
          }

          return {
            ...p,
            stockDeposito: newDeposito,
            stockLoja: newLoja,
            lastUpdated: new Date().toISOString(),
          };
        }
        return p;
      })
    );

    try {
      const response = await authFetch('/api/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMov),
      });

      if (!response.ok) {
        if (response.status === 403) {
          handle403PermissionDenied('Registrar Movimentação de Estoque');
          throw new Error('Você não tem permissão para lançar movimentações manuais de estoque.');
        }
        const errData = await safeParseJson<{ error?: string }>(response);
        throw new Error(errData?.error || `Erro HTTP ${response.status} ao registrar movimentação no servidor.`);
      }
    } catch (error) {
      console.error('Falha ao registrar movimentação no servidor PostgreSQL:', error);
      throw error;
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
      app: 'GummyStock ERP System',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      company: companyInfo,
      products,
      nfEntries,
      transfers,
      movements,
      users,
      categories,
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `backup_gummystock_${companyInfo.cnpj ? companyInfo.cnpj.replace(/\D/g, '') : 'empresa'}_${dateStr}.json`;
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
        isLoadingUsers,
        isLoadingCompany,
        companyInfo,
        updateCompanyInfo,
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
        deleteNFEntry,
        transferStock,
        registerMovement,
        markNotificationRead,
        markAllNotificationsRead,
        roles,
        isLoadingRoles,
        fetchRoles,
        createRole,
        updateRole,
        deleteRole,
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
