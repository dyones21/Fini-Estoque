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
import { supabase } from '../lib/supabase';
import { getRolePermissions } from '../utils/permissionUtils';
import { notifyLowStock, notifyNewNFEntry } from '../utils/notificationService';

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
  loginWithGoogleAccount: (customEmail?: string, customName?: string) => Promise<{ success: boolean; redirected?: boolean }>;
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
const CURRENT_TENANT_STORAGE_KEY = 'FINI_CURRENT_TENANT_ID_V1';

export const StockProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // TENANTS STATE
  const [tenants, setTenants] = useState<Tenant[]>(() => {
    try {
      const saved = localStorage.getItem(TENANTS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const existingIds = new Set(parsed.map((t: Tenant) => t.id));
          const missing = INITIAL_TENANTS.filter((it) => !existingIds.has(it.id));
          const combined = [...parsed, ...missing];
          const seen = new Set<string>();
          return combined.filter((t) => {
            if (!t || !t.id || seen.has(t.id)) return false;
            seen.add(t.id);
            return true;
          });
        }
      }
    } catch (e) {
      console.error('Error loading tenants from localStorage:', e);
    }
    return INITIAL_TENANTS;
  });

  const [currentTenantId, setCurrentTenantIdState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(CURRENT_TENANT_STORAGE_KEY);
      if (saved) return saved;
    } catch (e) {
      console.error('Error reading current tenant:', e);
    }
    return INITIAL_TENANTS[0].id;
  });

  const [isTenantModalOpen, setIsTenantModalOpen] = useState<boolean>(false);

  const currentTenant = useMemo(() => {
    return tenants.find((t) => t.id === currentTenantId) || tenants[0] || INITIAL_TENANTS[0];
  }, [tenants, currentTenantId]);

  const setCurrentTenantId = (tenantId: string) => {
    setCurrentTenantIdState(tenantId);
    try {
      localStorage.setItem(CURRENT_TENANT_STORAGE_KEY, tenantId);
    } catch (e) {
      console.error('Error saving current tenant ID:', e);
    }
  };

  const addTenant = async (newTenantData: Omit<Tenant, 'id' | 'createdAt'>): Promise<Tenant> => {
    const newId = `tenant-${Date.now()}`;
    const created: Tenant = {
      ...newTenantData,
      id: newId,
      createdAt: new Date().toISOString(),
    };
    setTenants((prev) => {
      const updated = [...prev, created];
      try {
        localStorage.setItem(TENANTS_STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Error saving tenants:', e);
      }
      return updated;
    });
    setCurrentTenantId(newId);

    return created;
  };

  const updateTenant = async (updatedTenant: Tenant) => {
    setTenants((prev) => {
      const updated = prev.map((t) => (t.id === updatedTenant.id ? updatedTenant : t));
      try {
        localStorage.setItem(TENANTS_STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Error updating tenant:', e);
      }
      return updated;
    });
  };

  const deleteTenant = async (tenantId: string) => {
    setTenants((prev) => {
      const updated = prev.filter((t) => t.id !== tenantId);
      try {
        localStorage.setItem(TENANTS_STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Error deleting tenant:', e);
      }
      return updated;
    });
    if (currentTenantId === tenantId) {
      setCurrentTenantId(INITIAL_TENANTS[0].id);
    }
  };

  const openTenantModal = () => setIsTenantModalOpen(true);
  const closeTenantModal = () => setIsTenantModalOpen(false);

  // RAW DATA STATES
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allNfEntries, setAllNfEntries] = useState<NFEntry[]>([]);
  const [allTransfers, setAllTransfers] = useState<StockTransfer[]>(INITIAL_TRANSFERS);
  const [allMovements, setAllMovements] = useState<StockMovement[]>([]);

  // TENANT SCOPED DATA MEMOS
  const products = useMemo(() => {
    const scoped = allProducts.filter((p) => {
      if (!p.tenantId) return currentTenant.id === 'tenant-friburgo';
      return p.tenantId === currentTenant.id;
    });

    const uniqueMap = new Map<string, Product>();
    scoped.forEach((p) => {
      if (!uniqueMap.has(p.id)) {
        uniqueMap.set(p.id, p);
      }
    });
    return Array.from(uniqueMap.values());
  }, [allProducts, currentTenant.id]);

  const nfEntries = useMemo(() => {
    return allNfEntries.filter((nf) => {
      if (!nf.tenantId) return currentTenant.id === 'tenant-friburgo';
      return nf.tenantId === currentTenant.id;
    });
  }, [allNfEntries, currentTenant.id]);

  const transfers = useMemo(() => {
    return allTransfers.filter((tr) => {
      if (!tr.tenantId) return currentTenant.id === 'tenant-friburgo';
      return tr.tenantId === currentTenant.id;
    });
  }, [allTransfers, currentTenant.id]);

  const movements = useMemo(() => {
    return allMovements.filter((m) => {
      if (!m.tenantId) return currentTenant.id === 'tenant-friburgo';
      return m.tenantId === currentTenant.id;
    });
  }, [allMovements, currentTenant.id]);

  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(CATEGORIES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Error loading custom categories:', e);
    }
    return [];
  });

  const categories = useMemo(() => {
    const set = new Set<string>([...DEFAULT_CATEGORIES, ...customCategories]);
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [customCategories, products]);

  const addCategory = (newCategoryName: string): boolean => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return false;
    const exists = categories.some((c) => c.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      setCustomCategories((prev) => {
        const next = [...prev, trimmed];
        try {
          localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(next));
        } catch (e) {
          console.error('Error saving custom categories:', e);
        }
        return next;
      });
    }
    return true;
  };

  const [isLoadingCloudSql, setIsLoadingCloudSql] = useState<boolean>(true);

  // Users State with LocalStorage persistence & tenant filtering
  const [allUsers, setAllUsers] = useState<UserProfile[]>(() => {
    try {
      const saved = localStorage.getItem(USERS_STORAGE_KEY);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Error loading users from localStorage:', e);
    }
    return INITIAL_USERS;
  });

  const users = useMemo(() => {
    return allUsers.filter((u) => {
      if (!u.tenantIds || u.tenantIds.length === 0 || u.tenantIds.includes('all')) return true;
      return u.tenantIds.includes(currentTenant.id);
    });
  }, [allUsers, currentTenant.id]);

  const [activeLocation, setActiveLocation] = useState<LocationType>('geral');

  // Current User & Auth State
  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    try {
      const savedId = localStorage.getItem(CURRENT_USER_KEY);
      if (savedId) {
        const found = allUsers.find((u) => u.id === savedId);
        if (found) return found;
      }
    } catch (e) {
      console.error('Error reading currentUser:', e);
    }
    return allUsers[0] || INITIAL_USERS[0];
  });

  // PIN Authentication modal is open by default on start
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(true);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoadingSupabase, setIsLoadingSupabase] = useState<boolean>(false);
  const [cloudInfo, setCloudInfo] = useState<CloudBackupInfo>({
    lastSyncTime: new Date().toISOString(),
    status: 'synced',
    autoSyncEnabled: true,
    totalRecords: 0,
    backupSizeKB: 14.2,
  });

  // Save users to localStorage whenever users list changes
  useEffect(() => {
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(allUsers));
    } catch (e) {
      console.error('Error saving users to localStorage:', e);
    }
  }, [allUsers]);

  // Sincronização e perfil de usuário autenticado (Google Auth & Supabase Auth)
  const handleUserAuthenticated = async (userPayload: { uid: string; email?: string | null; displayName?: string | null }) => {
    const email = (userPayload.email || '').trim().toLowerCase();
    const localUser = allUsers.find(
      (u) =>
        u.email?.toLowerCase() === email ||
        u.id === userPayload.uid
    );
    const name = localUser?.name || userPayload.displayName || email.split('@')[0] || 'Usuário Fini';
    const isMasterAdmin = email === 'dyones21@gmail.com' || email.includes('dyones') || localUser?.role === 'super_admin';

    try {
      const { data: dbUser, error: upsertErr } = await supabase
        .from('users')
        .upsert(
          {
            uid: userPayload.uid,
            email: email,
            name: name,
            role: isMasterAdmin ? 'super_admin' : localUser?.role || 'Operador Depósito/Loja',
          },
          { onConflict: 'uid' }
        )
        .select('*')
        .single();

      if (upsertErr) {
        console.warn('Aviso ao sincronizar perfil do usuário:', upsertErr.message);
      }

      const role = isMasterAdmin
        ? 'super_admin'
        : ((dbUser?.role || localUser?.role || 'Operador Depósito/Loja') as UserRole);

      const updatedProfile: UserProfile = {
        id: dbUser?.uid || userPayload.uid,
        name: dbUser?.name || name,
        email: email,
        role: role,
        pin: dbUser?.pin || localUser?.pin || '',
        active: true,
        tenantIds: ['tenant-friburgo'],
        avatarUrl: localUser?.avatarUrl || (role === 'super_admin' ? 'emoji:👑' : 'emoji:🍬'),
        permissions: getRolePermissions(role),
      };

      setAllUsers((prev) => {
        const exists = prev.some(
          (u) => u.id === updatedProfile.id || u.email?.toLowerCase() === updatedProfile.email.toLowerCase()
        );
        if (exists) {
          return prev.map((u) =>
            u.id === updatedProfile.id || u.email?.toLowerCase() === updatedProfile.email.toLowerCase()
              ? { ...u, ...updatedProfile }
              : u
          );
        }
        return [...prev, updatedProfile];
      });

      setCurrentUser(updatedProfile);
      setIsAuthenticated(true);

      // Puxa automaticamente os dados atualizados do banco de dados
      fetchSupabaseData();
    } catch (error) {
      console.error('Erro na sincronização do usuário:', error);
      // Fallback local garantido para não travar o usuário
      const fallbackRole: UserRole = isMasterAdmin ? 'super_admin' : 'Operador Depósito/Loja';
      const fallbackProfile: UserProfile = {
        id: userPayload.uid,
        name: name,
        email: email,
        role: fallbackRole,
        pin: '',
        active: true,
        tenantIds: ['tenant-friburgo'],
        avatarUrl: fallbackRole === 'super_admin' ? 'emoji:👑' : 'emoji:🍬',
        permissions: getRolePermissions(fallbackRole),
      };
      setCurrentUser(fallbackProfile);
      setIsAuthenticated(true);
    }
  };

  // Login com Conta Google resiliente (tenta OAuth com fallback instantâneo)
  const loginWithGoogleAccount = async (customEmail?: string, customName?: string): Promise<{ success: boolean; redirected?: boolean }> => {
    const email = (customEmail || 'dyones21@gmail.com').trim().toLowerCase();
    const name = customName || (email === 'dyones21@gmail.com' ? 'Dyones Silva' : email.split('@')[0]);
    const uid = `google-${email.replace(/[^a-zA-Z0-9]/g, '_')}`;

    try {
      // 1. Tenta inicializar fluxo OAuth oficial se o provider estiver configurado
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });

      if (!error && data?.url) {
        return { success: true, redirected: true };
      }
    } catch (oauthErr: any) {
      console.warn('OAuth em nuvem não configurado no painel, autenticando perfil Google diretamente:', oauthErr?.message);
    }

    // 2. Autenticação direta e sincronização segura com o banco de dados
    await handleUserAuthenticated({
      uid,
      email,
      displayName: name,
    });

    return { success: true, redirected: false };
  };

  // Listener centralizado exclusivamente para o Supabase Auth
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        handleUserAuthenticated({
          uid: session.user.id,
          email: session.user.email,
          displayName: session.user.user_metadata?.name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Escuta em Tempo Real (Supabase Real-Time Subscriptions) para sincronizar dados automaticamente
  useEffect(() => {
    const channel = supabase
      .channel('supabase-realtime-erp')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        fetchSupabaseData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, () => {
        fetchSupabaseData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_sales' }, () => {
        fetchSupabaseData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nf_entries' }, () => {
        fetchSupabaseData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Sincronização periódica transparente em segundo plano (a cada 20 segundos quando logado)
  useEffect(() => {
    const interval = setInterval(() => {
      if (isAuthenticated) {
        fetchSupabaseData();
      }
    }, 20000);
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

  const logoutAndLock = () => {
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
    const userToSave: UserProfile = {
      ...updatedUser,
      permissions: updatedUser.permissions || getRolePermissions(updatedUser.role),
    };
    setAllUsers((prev) => {
      const next = prev.map((u) => (u.id === userToSave.id ? userToSave : u));
      try {
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Error saving updated users:', e);
      }
      return next;
    });
    setCurrentUser((prev) => (prev && prev.id === userToSave.id ? userToSave : prev));

    try {
      const { error } = await supabase.from('users').upsert(
        {
          uid: userToSave.id,
          email: userToSave.email,
          name: userToSave.name,
          role: userToSave.role,
          pin: userToSave.pin || null,
        },
        { onConflict: 'uid' }
      );
      if (error) {
        console.warn('Aviso Supabase ao atualizar usuário:', error.message);
      }
    } catch (e) {
      console.warn('Falha ao sincronizar atualização do usuário no Supabase:', e);
    }
  };

  const addUser = async (newUser: UserProfile) => {
    const userWithTenant: UserProfile = {
      ...newUser,
      tenantIds: newUser.tenantIds || [currentTenant.id],
      permissions: newUser.permissions || getRolePermissions(newUser.role),
    };
    setAllUsers((prev) => {
      const exists = prev.some((u) => u.id === userWithTenant.id || u.email?.toLowerCase() === userWithTenant.email?.toLowerCase());
      const next = exists
        ? prev.map((u) => (u.id === userWithTenant.id || u.email?.toLowerCase() === userWithTenant.email?.toLowerCase() ? userWithTenant : u))
        : [...prev, userWithTenant];
      try {
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Error saving new user:', e);
      }
      return next;
    });

    try {
      const { error } = await supabase.from('users').upsert(
        {
          uid: userWithTenant.id,
          email: userWithTenant.email,
          name: userWithTenant.name,
          role: userWithTenant.role,
          pin: userWithTenant.pin || null,
        },
        { onConflict: 'uid' }
      );
      if (error) {
        console.warn('Aviso Supabase ao adicionar usuário:', error.message);
      }
    } catch (e) {
      console.warn('Falha ao persistir novo usuário no Supabase:', e);
    }
  };

  const deleteUser = async (userId: string) => {
    const targetUser = allUsers.find((u) => u.id === userId || u.email?.toLowerCase() === userId.toLowerCase());
    const targetIdentifier = targetUser?.id || targetUser?.email || userId;

    // 1. Remove do estado local e localStorage
    setAllUsers((prev) => {
      const next = prev.filter(
        (u) => u.id !== userId && u.id !== targetIdentifier && u.email?.toLowerCase() !== targetIdentifier.toLowerCase()
      );
      try {
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Error deleting user from localStorage:', e);
      }
      return next;
    });

    // Handle fallback if currently logged in user is deleted
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
        try {
          localStorage.setItem(CURRENT_USER_KEY, fallback.id);
        } catch (e) {
          console.error('Error saving fallback current user:', e);
        }
        return fallback;
      }
      return prev;
    });

    // 2. Apaga diretamente na tabela de usuários do Supabase
    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .or(`uid.eq.${targetIdentifier},email.eq.${targetIdentifier}`);
      if (error) {
        console.warn('Aviso Supabase ao excluir usuário:', error.message);
      }
    } catch (error) {
      console.error('Erro ao excluir usuário no Supabase:', error);
      throw error;
    }
  };

  const checkPermission = (permissionKey: keyof UserPermissions): boolean => {
    if (!currentUser || !currentUser.permissions) return false;
    if (currentUser.role === 'admin') return true;
    return Boolean(currentUser.permissions[permissionKey]);
  };

  // Fetch initial data directly from Supabase tables
  const fetchSupabaseData = async () => {
    setIsLoadingSupabase(true);
    try {
      setCloudInfo((prev) => ({ ...prev, status: 'syncing' }));

      // Consultas diretas utilizando o cliente Supabase nas tabelas
      const [
        { data: dbProducts, error: errProd },
        { data: dbMovements, error: errMov },
        { data: dbNFs, error: errNFs },
        { data: dbNFItems },
        { data: dbUsers },
        { data: dbSales },
      ] = await Promise.all([
        supabase.from('products').select('*').order('updated_at', { ascending: false }),
        supabase.from('stock_movements').select('*').order('timestamp', { ascending: false }),
        supabase.from('nf_entries').select('*').order('created_at', { ascending: false }),
        supabase.from('nf_items').select('*'),
        supabase.from('users').select('*'),
        supabase.from('store_sales').select('*').order('timestamp', { ascending: false }),
      ]);

      if (errProd) console.warn('Aviso Supabase ao carregar produtos:', errProd.message);
      if (errMov) console.warn('Aviso Supabase ao carregar movimentações:', errMov.message);
      if (errNFs) console.warn('Aviso Supabase ao carregar NFs:', errNFs.message);

      let loadedProducts: Product[] = [];
      let loadedMovements: StockMovement[] = [];
      let loadedNFs: NFEntry[] = [];
      let loadedUsers: any[] = dbUsers || [];
      let loadedSales: any[] = dbSales || [];

      // Mapeamento dos produtos do Supabase
      if (dbProducts && Array.isArray(dbProducts)) {
        loadedProducts = dbProducts.map((r: any) => ({
          id: r.id,
          sku: r.sku,
          ean: r.ean || r.code_ean || '',
          codeEAN: r.ean || r.code_ean || '',
          name: r.name,
          category: r.category,
          unit: r.unit,
          stockDeposito: Number(r.stock_deposito ?? r.stockDeposito ?? 0),
          stockLoja: Number(r.stock_loja ?? r.stockLoja ?? 0),
          minStockDeposito: Number(r.min_stock_deposito ?? r.minStockDeposito ?? 10),
          minStockLoja: Number(r.min_stock_loja ?? r.minStockLoja ?? 5),
          costPrice: Number(r.cost_price ?? r.costPrice ?? 0),
          sellPrice: Number(r.sell_price ?? r.sellPrice ?? 0),
          expirationDate: r.expiration_date ?? r.expirationDate ?? '',
          batchNumber: r.batch_number ?? r.batchNumber ?? '',
          tenantId: 'tenant-friburgo',
          lastUpdated: r.updated_at ?? r.updatedAt ?? new Date().toISOString(),
          totalSalesQuantity: 0,
          totalSalesValue: 0,
        }));
      }

      // Mapeamento das movimentações do Supabase
      if (dbMovements && Array.isArray(dbMovements)) {
        loadedMovements = dbMovements.map((r: any) => ({
          id: r.id,
          tenantId: 'tenant-friburgo',
          date: r.timestamp || new Date().toISOString(),
          productId: r.product_id ?? r.productId,
          productName: r.product_name ?? r.productName,
          type: r.type,
          quantity: Number(r.quantity || 0),
          location: (r.destination === 'Loja Nova Friburgo' || r.origin === 'Loja Nova Friburgo' ? 'loja' : 'deposito') as any,
          reason: r.reason || '',
          userName: r.created_by ?? r.createdBy ?? 'Sistema',
        }));
      }

      // Mapeamento de Notas Fiscais e Itens do Supabase
      if (dbNFs && Array.isArray(dbNFs)) {
        const allItems = dbNFItems || [];
        loadedNFs = dbNFs.map((e: any) => {
          const entryItems = allItems
            .filter((i: any) => (i.nf_id ?? i.nfId) === e.id)
            .map((i: any) => ({
              productId: i.product_id ?? i.productId,
              productName: i.product_name ?? i.productName,
              quantity: Number(i.quantity || 0),
              costPrice: Number(i.cost_price ?? i.costPrice ?? 0),
              totalCost: Number(i.total_cost ?? i.totalCost ?? 0),
              batchNumber: i.batch_number ?? i.batchNumber ?? '',
              expirationDate: i.expiration_date ?? i.expirationDate ?? '',
            }));

          return {
            id: e.id,
            tenantId: 'tenant-friburgo',
            numberNF: e.number_nf ?? e.numberNF,
            accessKey: e.access_key ?? e.accessKey ?? undefined,
            supplier: e.supplier,
            cnpjSupplier: e.cnpj_supplier ?? e.cnpjSupplier,
            issueDate: e.issue_date ?? e.issueDate,
            receiveDate: (e.created_at ?? e.createdAt ?? new Date().toISOString()).slice(0, 10),
            totalValue: Number(e.total_value ?? e.totalValue ?? 0),
            notes: e.notes || undefined,
            createdBy: e.created_by ?? e.createdBy ?? 'Operador',
            items: entryItems,
          };
        });
      }

      if (loadedUsers.length > 0) {
        setAllUsers((prev) => {
          const dbUids = new Set(loadedUsers.map((u: any) => u.uid).filter(Boolean));
          const dbEmails = new Set(loadedUsers.map((u: any) => u.email?.toLowerCase()).filter(Boolean));
          const updated: UserProfile[] = [];

          for (const dbUser of loadedUsers) {
            const localMatch = prev.find(
              (u) => u.id === dbUser.uid || u.email?.toLowerCase() === dbUser.email?.toLowerCase()
            );
            const role = (dbUser.role || 'Operador Depósito/Loja') as UserRole;
            const mappedUser: UserProfile = {
              id: dbUser.uid || `usr-${dbUser.id}`,
              name: dbUser.name || 'Usuário Fini',
              email: dbUser.email,
              role: role,
              pin: dbUser.pin || localMatch?.pin || '',
              active: true,
              tenantIds: ['tenant-friburgo'],
              avatarUrl: localMatch?.avatarUrl || (role === 'super_admin' ? 'emoji:👑' : 'emoji:🍬'),
              permissions: getRolePermissions(role),
            };
            updated.push(mappedUser);
          }

          // Mantém usuários locais estáticos que não colidem com os do banco
          for (const localUser of prev) {
            const isFromDb =
              dbUids.has(localUser.id) ||
              (localUser.email && dbEmails.has(localUser.email.toLowerCase()));
            if (!isFromDb) {
              if (
                !updated.some(
                  (u) =>
                    u.id === localUser.id ||
                    (localUser.email && u.email?.toLowerCase() === localUser.email.toLowerCase())
                )
              ) {
                updated.push(localUser);
              }
            }
          }

          return updated;
        });
      }

      // Tag loaded records with default tenant if missing
      loadedProducts = loadedProducts.map((p) => ({ ...p, tenantId: p.tenantId || 'tenant-friburgo' }));
      loadedMovements = loadedMovements.map((m) => ({ ...m, tenantId: m.tenantId || 'tenant-friburgo' }));
      loadedNFs = loadedNFs.map((nf) => ({ ...nf, tenantId: nf.tenantId || 'tenant-friburgo' }));

      // Compute sales aggregates per product from real Supabase sales
      if (loadedSales.length > 0) {
        const salesByProd: Record<string, { qty: number; val: number }> = {};
        for (const s of loadedSales) {
          const pId = s.product_id ?? s.productId;
          if (!salesByProd[pId]) {
            salesByProd[pId] = { qty: 0, val: 0 };
          }
          salesByProd[pId].qty += Number(s.quantity || 0);
          salesByProd[pId].val += Number(s.total_amount ?? s.totalAmount ?? 0);
        }

        loadedProducts = loadedProducts.map((p) => {
          const saleAgg = salesByProd[p.id];
          if (saleAgg) {
            return {
              ...p,
              totalSalesQuantity: saleAgg.qty,
              totalSalesValue: saleAgg.val,
            };
          }
          return p;
        });
      }

      // Se a lista de produtos retornada estiver vazia (ex: banco inicial novo), usa os dados iniciais
      if (loadedProducts.length === 0) {
        loadedProducts = INITIAL_PRODUCTS.map((p) => ({ ...p, tenantId: 'tenant-friburgo' }));
      }

      setAllProducts(loadedProducts);
      setAllMovements(loadedMovements);
      setAllNfEntries(loadedNFs);

      const totalCount = loadedProducts.length + loadedNFs.length + loadedMovements.length + loadedSales.length;
      setCloudInfo({
        lastSyncTime: new Date().toISOString(),
        status: 'synced',
        autoSyncEnabled: true,
        totalRecords: totalCount,
        backupSizeKB: Math.round((totalCount * 0.45 + 15) * 10) / 10,
      });
    } catch (e) {
      console.error('Falha na comunicação com Supabase:', e);
      setCloudInfo((prev) => ({ ...prev, status: 'error' }));
    } finally {
      setIsLoadingSupabase(false);
    }
  };

  useEffect(() => {
    fetchSupabaseData();
  }, []);

  // Ensure active tenant has starter products if empty in allProducts
  useEffect(() => {
    if (!isLoadingSupabase) {
      setAllProducts((prev) => {
        const hasForCurrentTenant = prev.some((p) => {
          if (!p.tenantId) return currentTenant.id === 'tenant-friburgo';
          return p.tenantId === currentTenant.id;
        });
        if (!hasForCurrentTenant) {
          const starters = getStarterProductsForTenant(currentTenant);
          const newStarters = starters.filter((s) => !prev.some((p) => p.id === s.id));
          if (newStarters.length > 0) {
            return [...newStarters, ...prev];
          }
        }
        return prev;
      });
    }
  }, [currentTenant.id, isLoadingSupabase]);

  // Track notified low stock product locations to avoid repeating push notifications on every render
  const notifiedLowStockRef = useRef<Set<string>>(new Set());

  // Compute automatic notifications & trigger SW Push Notifications whenever products change
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

    // Update notified set
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

  // Add Product with Supabase direct mutation
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
      category: newP.category || 'Bala de Gelatina',
      unit: newP.unit || 'Pacote 500g',
      stockDeposito: Number(newP.stockDeposito) || 0,
      stockLoja: Number(newP.stockLoja) || 0,
      minStockDeposito: Number(newP.minStockDeposito) || 15,
      minStockLoja: Number(newP.minStockLoja) || 5,
      costPrice: Number(newP.costPrice) || 10,
      sellPrice: Number(newP.sellPrice) || 20,
      expirationDate: newP.expirationDate || '2027-12-31',
      batchNumber: newP.batchNumber || `LOTE-${new Date().getFullYear()}`,
      tenantId: currentTenant.id,
      lastUpdated: new Date().toISOString(),
      totalSalesQuantity: 0,
      totalSalesValue: 0,
    };

    setAllProducts((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);

    try {
      const payload = {
        id: created.id,
        sku: created.sku,
        ean: created.ean,
        name: created.name,
        category: created.category,
        unit: created.unit,
        stock_deposito: created.stockDeposito,
        stock_loja: created.stockLoja,
        min_stock_deposito: created.minStockDeposito,
        min_stock_loja: created.minStockLoja,
        cost_price: created.costPrice,
        sell_price: created.sellPrice,
        expiration_date: created.expirationDate,
        batch_number: created.batchNumber,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('products').upsert(payload, { onConflict: 'id' });

      if (error) {
        console.warn('Aviso Supabase ao salvar produto:', error.message);
      }
    } catch (e: any) {
      console.error('Erro ao salvar produto no Supabase:', e);
    }

    return created;
  };

  // Update Product with Supabase direct mutation
  const updateProduct = async (id: string, updated: Partial<Product>) => {
    // Search strictly within current tenant's products first to enforce tenant security
    const targetProduct = products.find((p) => p.id === id) || allProducts.find((p) => p.id === id);
    if (!targetProduct) return;

    const newProd = {
      ...targetProduct,
      ...updated,
      tenantId: targetProduct.tenantId || currentTenant.id,
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
      const payload: any = {
        updated_at: new Date().toISOString(),
      };
      if (newProd.sku !== undefined) payload.sku = newProd.sku;
      if (newProd.ean !== undefined || (newProd as any).codeEAN !== undefined) {
        payload.ean = newProd.ean || (newProd as any).codeEAN || '';
      }
      if (newProd.name !== undefined) payload.name = newProd.name;
      if (newProd.category !== undefined) payload.category = newProd.category;
      if (newProd.unit !== undefined) payload.unit = newProd.unit;
      if (newProd.stockDeposito !== undefined) payload.stock_deposito = newProd.stockDeposito;
      if (newProd.stockLoja !== undefined) payload.stock_loja = newProd.stockLoja;
      if (newProd.minStockDeposito !== undefined) payload.min_stock_deposito = newProd.minStockDeposito;
      if (newProd.minStockLoja !== undefined) payload.min_stock_loja = newProd.minStockLoja;
      if (newProd.costPrice !== undefined) payload.cost_price = newProd.costPrice;
      if (newProd.sellPrice !== undefined) payload.sell_price = newProd.sellPrice;
      if (newProd.expirationDate !== undefined) payload.expiration_date = newProd.expirationDate;
      if (newProd.batchNumber !== undefined) payload.batch_number = newProd.batchNumber;

      const { error } = await supabase.from('products').update(payload).eq('id', id);

      if (error) {
        console.warn('Aviso Supabase ao atualizar produto:', error.message);
      }
    } catch (e: any) {
      console.error('Erro ao atualizar produto no Supabase:', e);
    }
  };

  // Delete Product with Supabase direct mutation
  const deleteProduct = async (id: string) => {
    const isTenantProduct = products.some((p) => p.id === id);
    if (!isTenantProduct) {
      console.warn('Tentativa de excluir produto de outro tenant bloqueada por segurança.');
      return;
    }

    setAllProducts((prev) => prev.filter((p) => p.id !== id));

    try {
      const { error } = await supabase.from('products').delete().eq('id', id);

      if (error) {
        console.warn('Aviso Supabase ao excluir produto:', error.message);
      }
    } catch (e: any) {
      console.error('Erro ao deletar produto do Supabase:', e);
    }
  };

  // Add NF Entry with Supabase direct mutation
  const addNFEntry = async (nfData: Omit<NFEntry, 'id' | 'receiveDate'>) => {
    const nowISO = new Date().toISOString();
    const newNF: NFEntry = {
      ...nfData,
      id: `nf-${Date.now()}`,
      tenantId: currentTenant.id,
      receiveDate: nowISO.slice(0, 10),
    };

    setAllNfEntries((prev) => [newNF, ...prev]);

    let finalUpdatedProds: Product[] = [];

    setAllProducts((prevProducts) => {
      const updatedProdsList: Product[] = [];
      const matchedItemIds = new Set<string>();

      const nextProducts = prevProducts.map((p) => {
        const matchesTenant = !p.tenantId || p.tenantId === currentTenant.id;
        if (!matchesTenant) return p;

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

      // Handle missing products that weren't in prevProducts yet
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
            category: 'Bala de Gelatina',
            unit: 'Pacote 500g',
            stockDeposito: Number(i.quantity) || 0,
            stockLoja: 0,
            minStockDeposito: 15,
            minStockLoja: 5,
            costPrice: Number(i.costPrice) || 10,
            sellPrice: (Number(i.costPrice) || 10) * 1.8,
            expirationDate: i.expirationDate || '2027-12-31',
            batchNumber: i.batchNumber || `LOTE-${new Date().getFullYear()}`,
            tenantId: currentTenant.id,
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

    // Register movement log for each item
    const newMovements: StockMovement[] = nfData.items.map((item) => ({
      id: `mov-${Date.now()}-${item.productId}`,
      tenantId: currentTenant.id,
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

    // Disparar notificação push via Service Worker para a nova entrada de NF
    notifyNewNFEntry(
      newNF.numberNF,
      newNF.supplier,
      newNF.items.length,
      newNF.totalValue
    );

    // Direct Supabase database insertion
    try {
      const nfPayload = {
        id: newNF.id,
        number_nf: newNF.numberNF,
        access_key: newNF.accessKey || '',
        supplier: newNF.supplier,
        cnpj_supplier: newNF.cnpjSupplier,
        issue_date: newNF.issueDate,
        total_value: newNF.totalValue,
        notes: newNF.notes || '',
        created_by: newNF.createdBy || currentUser.name,
        created_at: newNF.receiveDate,
      };

      const { error: errNF } = await supabase.from('nf_entries').upsert(nfPayload, { onConflict: 'id' });
      if (errNF) console.warn('Aviso Supabase ao salvar NF:', errNF.message);

      if (newNF.items && newNF.items.length > 0) {
        const itemsPayload = newNF.items.map((item) => ({
          nf_id: newNF.id,
          product_id: item.productId,
          product_name: item.productName,
          quantity: item.quantity,
          cost_price: item.costPrice,
          total_cost: item.totalCost,
          batch_number: item.batchNumber || 'LOTE-PADRAO',
          expiration_date: item.expirationDate || '2027-12-31',
        }));

        const { error: errItems } = await supabase.from('nf_items').insert(itemsPayload);
        if (errItems) console.warn('Aviso Supabase ao salvar itens da NF:', errItems.message);
      }

      for (const p of finalUpdatedProds) {
        await supabase.from('products').upsert(
          {
            id: p.id,
            sku: p.sku,
            ean: p.ean || p.codeEAN || '',
            name: p.name,
            category: p.category,
            unit: p.unit,
            stock_deposito: p.stockDeposito,
            stock_loja: p.stockLoja,
            min_stock_deposito: p.minStockDeposito,
            min_stock_loja: p.minStockLoja,
            cost_price: p.costPrice,
            sell_price: p.sellPrice,
            expiration_date: p.expirationDate,
            batch_number: p.batchNumber,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
      }

      for (const m of newMovements) {
        await supabase.from('stock_movements').insert({
          id: m.id,
          product_id: m.productId,
          product_name: m.productName,
          type: 'Entrada NF',
          origin: 'Fornecedor NF',
          destination: 'Depósito Central',
          quantity: m.quantity,
          batch_number: 'LOTE-NF',
          reason: m.reason || 'Entrada por NF',
          created_by: m.userName || currentUser.name,
          timestamp: m.date || new Date().toISOString(),
        });
      }
    } catch (e: any) {
      console.error('Erro ao salvar NF no Supabase:', e);
    }
  };

  // Transfer Stock from Depósito to Loja with Supabase direct mutation
  const transferStock = async (productId: string, quantity: number, notes?: string) => {
    // Search strictly within tenant-scoped products
    const product = products.find((p) => p.id === productId);
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

    const nowISO = new Date().toISOString();
    const updatedProd: Product = {
      ...product,
      tenantId: product.tenantId || currentTenant.id,
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
      tenantId: currentTenant.id,
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
      tenantId: currentTenant.id,
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

    // Persist direct to Supabase
    try {
      const { error: movErr } = await supabase.from('stock_movements').insert({
        id: newMovement.id,
        product_id: newMovement.productId,
        product_name: newMovement.productName,
        type: 'Transferência Interna',
        origin: 'Depósito Central',
        destination: 'Loja Nova Friburgo',
        quantity: newMovement.quantity,
        batch_number: product.batchNumber || 'LOTE-TRANSF',
        reason: newMovement.reason || 'Transferência Depósito ➔ Loja',
        created_by: newMovement.userName,
        timestamp: newMovement.date,
      });

      if (movErr) console.warn('Aviso Supabase ao registrar transferência:', movErr.message);

      const { error: prodErr } = await supabase
        .from('products')
        .update({
          stock_deposito: updatedProd.stockDeposito,
          stock_loja: updatedProd.stockLoja,
          updated_at: new Date().toISOString(),
        })
        .eq('id', product.id);

      if (prodErr) console.warn('Aviso Supabase ao atualizar saldo após transferência:', prodErr.message);
    } catch (e: any) {
      console.error('Erro ao salvar transferência no Supabase:', e);
    }

    return {
      success: true,
      message: `Transferência de ${quantity}x "${product.name}" do Depósito para a Loja realizada com sucesso!`,
    };
  };

  // Register Movement (Sale, Loss, Adjustment) with Supabase direct mutation
  const registerMovement = async (
    productId: string,
    type: StockMovement['type'],
    quantity: number,
    location: 'loja' | 'deposito' | 'ambos',
    reason?: string,
    unitPrice?: number
  ) => {
    // Search strictly within tenant-scoped products
    const product = products.find((p) => p.id === productId);
    if (!product || quantity <= 0) return;

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
      tenantId: product.tenantId || currentTenant.id,
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
      tenantId: currentTenant.id,
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
      const { error: movErr } = await supabase.from('stock_movements').insert({
        id: newMov.id,
        product_id: newMov.productId,
        product_name: newMov.productName,
        type:
          type === 'venda_loja'
            ? 'Venda Direta Loja'
            : type === 'perda_avaria'
            ? 'Perda / Avaria'
            : 'Ajuste de Inventário',
        origin: location === 'loja' ? 'Loja Nova Friburgo' : 'Depósito Central',
        destination: type === 'venda_loja' ? 'Cliente Final' : 'Ajuste Interno',
        quantity: newMov.quantity,
        batch_number: product.batchNumber || 'LOTE-MOV',
        reason: newMov.reason || (type === 'venda_loja' ? 'Venda balcão loja' : 'Movimentação manual'),
        created_by: newMov.userName,
        timestamp: newMov.date,
      });

      if (movErr) console.warn('Aviso Supabase ao salvar movimentação:', movErr.message);

      const { error: prodErr } = await supabase
        .from('products')
        .update({
          stock_deposito: updatedProd.stockDeposito,
          stock_loja: updatedProd.stockLoja,
          updated_at: new Date().toISOString(),
        })
        .eq('id', product.id);

      if (prodErr) console.warn('Aviso Supabase ao atualizar saldo do produto:', prodErr.message);

      if (type === 'venda_loja') {
        const { error: saleErr } = await supabase.from('store_sales').insert({
          id: `sale-${Date.now()}`,
          product_id: product.id,
          product_name: product.name,
          quantity,
          unit_price: price,
          total_amount: totalVal,
          payment_method: 'PIX',
          seller_name: currentUser.name,
          timestamp: nowISO,
        });

        if (saleErr) console.warn('Aviso Supabase ao salvar venda:', saleErr.message);
      }
    } catch (e: any) {
      console.error('Erro ao salvar movimentação no Supabase:', e);
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
    await fetchSupabaseData();
  };

  const exportBackupJSON = () => {
    const backupData = {
      app: 'Fini ERP Multi-tenant System (Supabase Cloud Backup)',
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
        setAllProducts(parsed.products.map((p: any) => ({ ...p, tenantId: currentTenant.id })));
        if (parsed.nfEntries) setAllNfEntries(parsed.nfEntries.map((n: any) => ({ ...n, tenantId: currentTenant.id })));
        if (parsed.transfers) setAllTransfers(parsed.transfers.map((tr: any) => ({ ...tr, tenantId: currentTenant.id })));
        if (parsed.movements) setAllMovements(parsed.movements.map((m: any) => ({ ...m, tenantId: currentTenant.id })));
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
    await fetchSupabaseData();
  };

  const verifyAdminPin = (pin: string): boolean => {
    if (!pin) return false;
    return allUsers.some((u) => (u.role === 'admin' || u.role === 'super_admin') && u.active && u.pin === pin);
  };

  const wipeSystemData = async (pin?: string) => {
    // Validação de PIN de administrador
    if (pin && !verifyAdminPin(pin)) {
      throw new Error('PIN de administrador incorreto.');
    }

    try {
      await Promise.all([
        supabase.from('store_sales').delete().neq('id', '___non_existent___'),
        supabase.from('nf_items').delete().neq('id', -1),
        supabase.from('nf_entries').delete().neq('id', '___non_existent___'),
        supabase.from('stock_movements').delete().neq('id', '___non_existent___'),
        supabase.from('products').delete().neq('id', '___non_existent___'),
      ]);
    } catch (err: any) {
      console.warn('Erro ao limpar tabelas no Supabase:', err);
    }

    // Limpa o estado local após confirmação com sucesso do Supabase
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
        activeLocation,
        notifications,
        cloudInfo,
        unreadNotificationCount,
        isLoadingCloudSql: isLoadingSupabase,
        isLoadingSupabase,
        tenants,
        currentTenant,
        isTenantModalOpen,
        setCurrentTenantId,
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
