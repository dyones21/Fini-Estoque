import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { StockProvider, useStock } from './context/StockContext';
import { Header } from './components/Header';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { StockTable } from './components/StockTable';
import { CurvaABCView } from './components/CurvaABCView';
import { RankingView } from './components/RankingView';
import { CloudBackupModal } from './components/CloudBackupModal';
import { NFEntryModal } from './components/NFEntryModal';
import { TransferModal } from './components/TransferModal';
import { MovementModal } from './components/MovementModal';
import { ProductFormModal } from './components/ProductFormModal';
import { StoreSaleModal } from './components/StoreSaleModal';
import { LoginPage } from './components/LoginPage';
import { TenantManagementModal } from './components/TenantManagementModal';
import { SaaSManagementModal } from './components/SaaSManagementModal';
import { SaaSMasterScreen } from './components/SaaSMasterScreen';
import { UserManagementView } from './components/UserManagementView';
import { ReportsView } from './components/ReportsView';
import { Product } from './types';
import { StockFilterOptions } from './components/Dashboard';

const AccessDeniedMessage: React.FC<{ featureName: string }> = ({ featureName }) => (
  <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm text-center max-w-lg mx-auto my-12 space-y-4">
    <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
      <ShieldAlert className="w-8 h-8" />
    </div>
    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Acesso Restrito</h3>
    <p className="text-xs font-semibold text-slate-600 leading-relaxed">
      Seu perfil de usuário não possui permissão para acessar <span className="font-bold text-rose-600">{featureName}</span>.
    </p>
    <p className="text-[11px] text-slate-400">
      Solicite ao administrador do sistema a liberação deste módulo na aba de Gestão de Usuários.
    </p>
  </div>
);

const MainApp: React.FC = () => {
  const {
    activeLocation,
    setActiveLocation,
    currentUser,
    isAuthenticated,
    isAuthModalOpen,
    checkPermission,
    isTenantModalOpen,
    closeTenantModal,
  } = useStock();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [saasViewMode, setSaasViewMode] = useState<'master' | 'erp'>('master');

  // Stock table filter state for drill-down navigation from Dashboard
  const [stockFilters, setStockFilters] = useState<StockFilterOptions>({});

  const handleNavigateToStock = (filters: StockFilterOptions) => {
    setStockFilters(filters);
    setActiveTab('estoque_geral');
  };

  // Modals state
  const [isNFModalOpen, setIsNFModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [isSaaSModalOpen, setIsSaaSModalOpen] = useState(false);

  // Selected product for modals
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const handleOpenTransferForProduct = (p: Product) => {
    setSelectedProduct(p);
    setIsTransferModalOpen(true);
  };

  const handleOpenMovementForProduct = (p: Product) => {
    setSelectedProduct(p);
    setIsMovementModalOpen(true);
  };

  const handleOpenEditProduct = (p: Product) => {
    setSelectedProduct(p);
    setIsProductModalOpen(true);
  };

  const handleOpenNewProduct = () => {
    setSelectedProduct(null);
    setIsProductModalOpen(true);
  };

  const handleOpenSaleForProduct = (p?: Product) => {
    setSelectedProduct(p || null);
    setIsSaleModalOpen(true);
  };

  // Dedicated SaaS Master Screen for System Owner (Dyones)
  if (currentUser?.role === 'super_admin' && saasViewMode === 'master') {
    return (
      <>
        <SaaSMasterScreen onSwitchToERP={() => setSaasViewMode('erp')} />
        <LoginPage />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800 antialiased selection:bg-rose-500 selection:text-white">
      
      {/* Header with activeTab sync, sale modal trigger, and SaaS Master switch */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onNavigateToStock={handleNavigateToStock}
        onOpenSaleModal={() => handleOpenSaleForProduct()}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        isMobileMenuOpen={isMobileMenuOpen}
        onOpenSaaSModal={() => setIsSaaSModalOpen(true)}
        onSwitchToSaaSMaster={() => setSaasViewMode('master')}
      />

      {/* Main Content Layout */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 gap-4 sm:gap-6">
        
        {/* Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab);
            setIsMobileMenuOpen(false);
          }}
          onOpenNFModal={() => setIsNFModalOpen(true)}
          onOpenTransferModal={() => {
            setSelectedProduct(null);
            setIsTransferModalOpen(true);
          }}
          onOpenSaleModal={() => handleOpenSaleForProduct()}
          onOpenSaaSModal={() => setIsSaaSModalOpen(true)}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />

        {/* View Switcher Container */}
        <main className="flex-1 min-w-0">
          {activeTab === 'dashboard' && (
            checkPermission('canViewDashboard') ? (
              <Dashboard
                setActiveTab={setActiveTab}
                onNavigateToStock={handleNavigateToStock}
              />
            ) : (
              <AccessDeniedMessage featureName="Dashboard e Indicadores" />
            )
          )}

          {(activeTab === 'estoque_geral' ||
            activeTab === 'estoque_loja' ||
            activeTab === 'estoque_deposito') && (
            checkPermission('canViewStock') ? (
              <StockTable
                locationMode={activeTab === 'estoque_loja' ? 'loja' : activeTab === 'estoque_deposito' ? 'deposito' : 'geral'}
                onOpenTransferModalForProduct={handleOpenTransferForProduct}
                onOpenMovementModalForProduct={handleOpenMovementForProduct}
                onOpenEditProductModal={handleOpenEditProduct}
                onOpenNewProductModal={handleOpenNewProduct}
                onOpenSaleModalForProduct={handleOpenSaleForProduct}
                onOpenNFModal={() => setIsNFModalOpen(true)}
                onOpenGeneralTransferModal={() => {
                  setSelectedProduct(null);
                  setIsTransferModalOpen(true);
                }}
                initialSearchQuery={stockFilters.searchQuery}
                initialCategory={stockFilters.category}
                initialStatus={stockFilters.status}
                initialIsFiltersOpen={
                  !!(stockFilters.searchQuery || stockFilters.category || stockFilters.status)
                }
              />
            ) : (
              <AccessDeniedMessage featureName="Tabelas de Estoque" />
            )
          )}

          {activeTab === 'entrada_nf' && (
            checkPermission('canAddNFEntries') ? (
              <StockTable
                locationMode="geral"
                onOpenTransferModalForProduct={handleOpenTransferForProduct}
                onOpenMovementModalForProduct={handleOpenMovementForProduct}
                onOpenEditProductModal={handleOpenEditProduct}
                onOpenNewProductModal={handleOpenNewProduct}
                onOpenSaleModalForProduct={handleOpenSaleForProduct}
                onOpenNFModal={() => setIsNFModalOpen(true)}
                onOpenGeneralTransferModal={() => {
                  setSelectedProduct(null);
                  setIsTransferModalOpen(true);
                }}
                initialSearchQuery={stockFilters.searchQuery}
                initialCategory={stockFilters.category}
                initialStatus={stockFilters.status}
                initialIsFiltersOpen={true}
              />
            ) : (
              <AccessDeniedMessage featureName="Entrada de Notas Fiscais" />
            )
          )}

          {activeTab === 'relatorios' && (
            checkPermission('canViewDashboard') || checkPermission('canViewStock') ? (
              <ReportsView />
            ) : (
              <AccessDeniedMessage featureName="Relatórios de Movimentação" />
            )
          )}

          {activeTab === 'curva_abc_ranking' && (
            checkPermission('canViewDashboard') ? (
              <div className="space-y-8">
                <CurvaABCView />
                <RankingView />
              </div>
            ) : (
              <AccessDeniedMessage featureName="Análise Curva ABC & Ranking" />
            )
          )}

          {activeTab === 'backup' && (
            checkPermission('canManageBackup') ? (
              <CloudBackupModal />
            ) : (
              <AccessDeniedMessage featureName="Backup e Sincronização em Nuvem" />
            )
          )}

          {activeTab === 'usuarios' && (
            checkPermission('canManageUsers') ? (
              <UserManagementView />
            ) : (
              <AccessDeniedMessage featureName="Gestão de Usuários e Permissões" />
            )
          )}
        </main>
      </div>

      {/* Global Dedicated Login Page & Account Switcher Portal */}
      <LoginPage />

      {/* SaaS Master Management Panel for System Owner */}
      <SaaSManagementModal isOpen={isSaaSModalOpen} onClose={() => setIsSaaSModalOpen(false)} />

      {/* Multi-Tenant Unit Management Modal */}
      <TenantManagementModal isOpen={isTenantModalOpen} onClose={closeTenantModal} />

      {/* Operational Modals */}
      <StoreSaleModal
        isOpen={isSaleModalOpen}
        onClose={() => setIsSaleModalOpen(false)}
        preselectedProduct={selectedProduct}
      />

      <NFEntryModal
        isOpen={isNFModalOpen}
        onClose={() => setIsNFModalOpen(false)}
      />

      <TransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        preselectedProduct={selectedProduct}
      />

      <MovementModal
        isOpen={isMovementModalOpen}
        onClose={() => setIsMovementModalOpen(false)}
        preselectedProduct={selectedProduct}
      />

      <ProductFormModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        editingProduct={selectedProduct}
      />

    </div>
  );
};

export default function App() {
  return (
    <StockProvider>
      <MainApp />
    </StockProvider>
  );
}
