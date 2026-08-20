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
import { auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getRolePermissions } from '../utils/permissionUtils';
import { notifyLowStock, notifyNewNFEntry } from '../utils/notificationService';
import { authFetch, syncUserWithPostgres } from '../utils/apiAuth';

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

  // Cloud & Backup & PostgreSQL Realtime
  triggerCloudSync: () => Promise<void>;
  exportBackupJSON: () => void;
  importBackupJSON: (jsonData: string) => boolean;
  resetToDefaultData: () => Promise<void>;
  wipeSystemData: () => Promise<void>;
  verifyAdminPin: (pin: string) => boolean;

  // PostgreSQL Realtime Sync Engine
  postgresSyncInterval: number;
  setPostgresSyncInterval: (seconds: number) => void;
  isRealtimeAutoSyncEnabled: boolean;
  setIsRealtimeAutoSyncEnabled: (enabled: boolean) => void;
  postgresLatencyMs: number;
  lastPostgresSyncTimestamp: string | null;
  refreshPostgresRealtime: () => Promise<void>;
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
  const [cloudInfo, setCloudInfo] = useState<CloudBackupInfo>({
    lastSyncTime: new Date().toISOString(),
    status: 'synced',
    autoSyncEnabled: true,
    totalRecords: 0,
    backupSizeKB: 14.2,
  });

  // PostgreSQL Realtime Sync Engine State
  const [postgresSyncInterval, setPostgresSyncIntervalState] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('FINI_PG_SYNC_INTERVAL')) || 15;
    } catch {
      return 15;
    }
  });

  const [isRealtimeAutoSyncEnabled, setIsRealtimeAutoSyncEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('FINI_PG_AUTOSYNC') !== 'false';
    } catch {
      return true;
    }
  });

  const [postgresLatencyMs, setPostgresLatencyMs] = useState<number>(0);
  const [lastPostgresSyncTimestamp, setLastPostgresSyncTimestamp] = useState<string | null>(null);

  const setPostgresSyncInterval = (seconds: number) => {
    setPostgresSyncIntervalState(seconds);
    try {
      localStorage.setItem('FINI_PG_SYNC_INTERVAL', String(seconds));
    } catch (e) {
      console.error(e);
    }
  };

  const setIsRealtimeAutoSyncEnabled = (enabled: boolean) => {
    setIsRealtimeAutoSyncEnabledState(enabled);
    try {
      localStorage.setItem('FINI_PG_AUTOSYNC', String(enabled));
    } catch (e) {
      console.error(e);
    }
  };

  // Save users to localStorage whenever users list changes
  useEffect(() => {
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(allUsers));
    } catch (e) {
      console.error('Error saving users to localStorage:', e);
    }
  }, [allUsers]);

  // Firebase Auth state listener - Auto-sync with Postgres users table via getOrCreateUser
  // O papel (role) e as permissões são determinados exclusivamente pelo servidor no backend.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Look up local user info (for avatar/pin preferences)
        const localUser = allUsers.find(
          (u) =>
            u.email?.toLowerCase() === firebaseUser.email?.toLowerCase() ||
            u.id === firebaseUser.uid
        );
        const name = localUser?.name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuário Fini';

        try {
          // O backend decide o cargo baseado na lista do servidor SUPER_ADMIN_EMAILS ou mantém o existente
          const syncedUser = await syncUserWithPostgres({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: name,
          });

          if (syncedUser) {
            const role = (syncedUser.role || 'Operador Depósito/Loja') as UserRole;
            const updatedProfile: UserProfile = {
              id: syncedUser.uid,
              name: syncedUser.name || name,
              email: syncedUser.email || firebaseUser.email || '',
              role: role,
              pin: localUser?.pin || '1234',
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

            // Puxa automaticamente os dados atualizados do Cloud SQL PostgreSQL
            fetchCloudSqlData();
          }
        } catch (error) {
          console.error('Erro na sincronização automática do usuário no Postgres:', error);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Sincronização periódica em tempo real baseada no intervalo configurado (5s a 60s)
  useEffect(() => {
    if (!isRealtimeAutoSyncEnabled) return;
    const interval = setInterval(() => {
      if (auth.currentUser) {
        fetchCloudSqlData();
      }
    }, postgresSyncInterval * 1000);
    return () => clearInterval(interval);
  }, [isRealtimeAutoSyncEnabled, postgresSyncInterval]);

  // Auth Functions
  const loginWithPin = (userId: string, pin: string): boolean => {
    const target = allUsers.find((u) => u.id === userId);
    if (target && target.pin === pin) {
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
  };

  const addUser = async (newUser: UserProfile) => {
    const userWithTenant: UserProfile = {
      ...newUser,
      tenantIds: newUser.tenantIds || [currentTenant.id],
      permissions: newUser.permissions || getRolePermissions(newUser.role),
    };
    setAllUsers((prev) => {
      const exists = prev.some((u) => u.id === userWithTenant.id);
      const next = exists
        ? prev.map((u) => (u.id === userWithTenant.id ? userWithTenant : u))
        : [...prev, userWithTenant];
      try {
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Error saving new user:', e);
      }
      return next;
    });
  };

  const deleteUser = async (userId: string) => {
    setAllUsers((prev) => {
      const next = prev.filter((u) => u.id !== userId);
      try {
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Error deleting user:', e);
      }
      return next;
    });

    // Handle fallback if currently logged in user is deleted
    setCurrentUser((prev) => {
      if (prev && prev.id === userId) {
        const remaining = allUsers.filter((u) => u.id !== userId);
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
  };

  const checkPermission = (permissionKey: keyof UserPermissions): boolean => {
    if (!currentUser || !currentUser.permissions) return false;
    if (currentUser.role === 'admin') return true;
    return Boolean(currentUser.permissions[permissionKey]);
  };

  // Fetch initial data from Cloud SQL via /api/* endpoints
  const fetchCloudSqlData = async () => {
    setIsLoadingCloudSql(true);
    const startTime = performance.now();
    try {
      setCloudInfo((prev) => ({ ...prev, status: 'syncing' }));

      const [resProd, resMov, resNF, resUsers, resSales] = await Promise.all([
        authFetch('/api/products').then((r) => (r.ok ? r.json() : [])).catch(() => []),
        authFetch('/api/movements').then((r) => (r.ok ? r.json() : [])).catch(() => []),
        authFetch('/api/nf-entries').then((r) => (r.ok ? r.json() : [])).catch(() => []),
        authFetch('/api/users').then((r) => (r.ok ? r.json() : [])).catch(() => []),
        authFetch('/api/sales').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ]);

      const latency = Math.round((performance.now() - startTime) * 10) / 10;
      setPostgresLatencyMs(latency);
      setLastPostgresSyncTimestamp(new Date().toISOString());

      let loadedProducts: Product[] = Array.isArray(resProd) ? resProd : [];
      let loadedMovements: StockMovement[] = Array.isArray(resMov) ? resMov : [];
      let loadedNFs: NFEntry[] = Array.isArray(resNF) ? resNF : [];
      let loadedUsers: any[] = Array.isArray(resUsers) ? resUsers : [];
      let loadedSales: any[] = Array.isArray(resSales) ? resSales : [];

      if (loadedUsers.length > 0) {
        setAllUsers((prev) => {
          const updated = [...prev];
          for (const dbUser of loadedUsers) {
            const index = updated.findIndex((u) => u.id === dbUser.uid || u.email?.toLowerCase() === dbUser.email?.toLowerCase());
            const role = (dbUser.role || 'Operador Depósito/Loja') as UserRole;
            const mappedUser: UserProfile = {
              id: dbUser.uid,
              name: dbUser.name || 'Usuário Fini',
              email: dbUser.email,
              role: role,
              pin: index >= 0 ? updated[index].pin : '1234',
              active: true,
              tenantIds: ['tenant-friburgo'],
              avatarUrl: index >= 0 ? updated[index].avatarUrl : (role === 'super_admin' ? 'emoji:👑' : 'emoji:🍬'),
              permissions: getRolePermissions(role),
            };

            if (index >= 0) {
              updated[index] = { ...updated[index], ...mappedUser };
            } else {
              updated.push(mappedUser);
            }
          }
          return updated;
        });
      }

      // Tag loaded records with default tenant if missing
      loadedProducts = loadedProducts.map((p) => ({ ...p, tenantId: p.tenantId || 'tenant-friburgo' }));
      loadedMovements = loadedMovements.map((m) => ({ ...m, tenantId: m.tenantId || 'tenant-friburgo' }));
      loadedNFs = loadedNFs.map((nf) => ({ ...nf, tenantId: nf.tenantId || 'tenant-friburgo' }));

      // Compute sales aggregates per product from real sales
      if (loadedSales.length > 0) {
        const salesByProd: Record<string, { qty: number; val: number }> = {};
        for (const s of loadedSales) {
          if (!salesByProd[s.productId]) {
            salesByProd[s.productId] = { qty: 0, val: 0 };
          }
          salesByProd[s.productId].qty += Number(s.quantity || 0);
          salesByProd[s.productId].val += Number(s.totalAmount || 0);
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

      // Se a lista de produtos retornada estiver vazia (ex: offline ou banco inicial), usa os dados iniciais locais
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
      console.error('Falha na comunicação com Cloud SQL:', e);
      setCloudInfo((prev) => ({ ...prev, status: 'error' }));
    } finally {
      setIsLoadingCloudSql(false);
    }
  };

  useEffect(() => {
    fetchCloudSqlData();
  }, []);

  // Ensure active tenant has starter products if empty in allProducts
  useEffect(() => {
    if (!isLoadingCloudSql) {
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
  }, [currentTenant.id, isLoadingCloudSql]);

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

  // Add Product with Firestore real-time sync & Cloud SQL fallback
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
      await authFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(created),
      });
    } catch (e) {
      console.error('Erro ao salvar produto no Cloud SQL:', e);
    }

    return created;
  };

  // Update Product with Firestore real-time sync & Cloud SQL fallback
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
      await authFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProd),
      });
    } catch (e) {
      console.error('Erro ao atualizar produto no Cloud SQL:', e);
    }
  };

  // Delete Product with Firestore real-time sync & Cloud SQL fallback
  const deleteProduct = async (id: string) => {
    const isTenantProduct = products.some((p) => p.id === id);
    if (!isTenantProduct) {
      console.warn('Tentativa de excluir produto de outro tenant bloqueada por segurança.');
      return;
    }

    setAllProducts((prev) => prev.filter((p) => p.id !== id));

    try {
      await authFetch(`/api/products/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Erro ao deletar produto do Cloud SQL:', e);
    }
  };

  // Add NF Entry with Cloud SQL sync
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

    // Sync to Cloud SQL
    try {
      await authFetch('/api/nf-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNF),
      });

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
    } catch (e) {
      console.error('Erro ao salvar NF no Cloud SQL:', e);
    }
  };

  // Transfer Stock from Depósito to Loja
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

    // Persist changes to Cloud SQL
    try {
      await authFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProd),
      });

      await authFetch('/api/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMovement),
      });
    } catch (e) {
      console.error('Erro ao salvar transferência no Cloud SQL:', e);
    }

    return {
      success: true,
      message: `Transferência de ${quantity}x "${product.name}" do Depósito para a Loja realizada com sucesso!`,
    };
  };

  // Register Movement (Sale, Loss, Adjustment)
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
      await authFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProd),
      });

      await authFetch('/api/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMov),
      });

      if (type === 'venda_loja') {
        await authFetch('/api/sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: `sale-${Date.now()}`,
            tenantId: currentTenant.id,
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
      }
    } catch (e) {
      console.error('Erro ao salvar movimentação no Cloud SQL:', e);
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
    await fetchCloudSqlData();
  };

  const exportBackupJSON = () => {
    const backupData = {
      app: 'Fini ERP Multi-tenant System (Google Cloud SQL Backup)',
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
    await fetchCloudSqlData();
  };

  const verifyAdminPin = (pin: string): boolean => {
    if (!pin) return false;
    return allUsers.some((u) => u.role === 'admin' && u.active && u.pin === pin);
  };

  const wipeSystemData = async () => {
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
        isLoadingCloudSql,
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
        postgresSyncInterval,
        setPostgresSyncInterval,
        isRealtimeAutoSyncEnabled,
        setIsRealtimeAutoSyncEnabled,
        postgresLatencyMs,
        lastPostgresSyncTimestamp,
        refreshPostgresRealtime: fetchCloudSqlData,
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
