import React, { useState } from 'react';
import {
  X,
  Building2,
  Plus,
  Check,
  ShieldCheck,
  MapPin,
  FileText,
  Sparkles,
  ArrowRight,
  Globe,
  Trash2,
  Edit2,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { Tenant } from '../types';

interface TenantManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TenantManagementModal: React.FC<TenantManagementModalProps> = ({ isOpen, onClose }) => {
  const {
    tenants,
    currentTenant,
    setCurrentTenantId,
    addTenant,
    deleteTenant,
    checkPermission,
    users,
  } = useStock();

  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('RJ');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleSelectTenant = (tenantId: string) => {
    setCurrentTenantId(tenantId);
    setSuccessMsg(`Unidade alterada com sucesso!`);
    setTimeout(() => {
      setSuccessMsg('');
      onClose();
    }, 600);
  };

  const handleCreateTenant = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg('Informe o nome da nova empresa/unidade.');
      return;
    }

    const newTenant = addTenant({
      name: name.trim(),
      code: code.trim().toUpperCase() || name.trim().slice(0, 8).toUpperCase(),
      cnpj: cnpj.trim() || '00.000.000/0001-00',
      city: city.trim() || 'Nova Unidade',
      state: state.trim().toUpperCase() || 'RJ',
      active: true,
      isMaster: false,
    });

    setSuccessMsg(`Nova empresa "${newTenant.name}" cadastrada e ativada!`);
    setIsAdding(false);
    setName('');
    setCode('');
    setCnpj('');
    setCity('');
    setState('RJ');

    setTimeout(() => {
      setSuccessMsg('');
    }, 2500);
  };

  const handleDeleteTenant = (tenant: Tenant) => {
    if (tenant.isMaster || tenant.id === 'tenant-friburgo') {
      alert('A unidade matriz original não pode ser removida.');
      return;
    }
    if (confirm(`Tem certeza que deseja remover a unidade "${tenant.name}"? Todos os dados vinculados a esta unidade serão isolados.`)) {
      deleteTenant(tenant.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-left my-8">
        
        {/* Modal Header */}
        <div className="bg-slate-900 p-6 text-white flex items-center justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3.5 relative z-10">
            <div className="p-3 rounded-2xl bg-rose-600 text-white shrink-0 shadow-md">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black uppercase tracking-tight">
                  Empresas & Unidades (Multi-Tenant)
                </h3>
                <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  ERP Multilojas
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                Alterne entre unidades ou cadastre novas filiais com isolamento total de dados
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors relative z-10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div className="m-4 mb-0 bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl flex items-center gap-3 text-xs font-bold text-emerald-800 animate-in slide-in-from-top-2">
            <Check className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Current Active Tenant Highlight */}
        <div className="p-5 bg-gradient-to-r from-rose-50 via-amber-50 to-rose-50 border-b border-rose-100/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center font-black text-xl shadow-md shrink-0">
              🏢
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase bg-rose-600 text-white px-2 py-0.5 rounded-md">
                  Unidade Ativa Atual
                </span>
                {currentTenant.isMaster && (
                  <span className="text-[10px] font-extrabold uppercase bg-amber-500 text-white px-2 py-0.5 rounded-md">
                    Matriz
                  </span>
                )}
              </div>
              <h4 className="text-base font-black text-slate-900 truncate mt-0.5">
                {currentTenant.name}
              </h4>
              <p className="text-xs text-slate-600 flex items-center gap-3 mt-0.5">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-rose-500" />
                  {currentTenant.city} - {currentTenant.state}
                </span>
                <span className="font-mono text-slate-500">CNPJ: {currentTenant.cnpj}</span>
              </p>
            </div>
          </div>

          {!isAdding && checkPermission('canManageUsers') && (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-2 shrink-0"
            >
              <Plus className="w-4 h-4 text-rose-400" />
              <span>Nova Empresa / Filial</span>
            </button>
          )}
        </div>

        {/* Form or Tenant List */}
        <div className="p-6 max-h-[460px] overflow-y-auto">
          {isAdding ? (
            /* FORM: CADASTRO DE NOVA EMPRESA / UNIDADE */
            <form onSubmit={handleCreateTenant} className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Cadastrar Nova Unidade / Empresa
                </h4>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800"
                >
                  Cancelar
                </button>
              </div>

              {errorMsg && (
                <p className="text-xs font-bold text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-200">
                  {errorMsg}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nome Completo da Empresa / Unidade <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Doceria Cabo Frio (Filial 03)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full text-xs font-bold p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Código de Identificação
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: CABO-FRIO-03"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full text-xs font-bold p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-rose-500 focus:outline-none uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    CNPJ da Unidade
                  </label>
                  <input
                    type="text"
                    placeholder="00.000.000/0001-00"
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    className="w-full text-xs font-bold p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-rose-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cidade
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Cabo Frio"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full text-xs font-bold p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Estado (UF)
                  </label>
                  <select
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full text-xs font-bold p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  >
                    <option value="RJ">Rio de Janeiro (RJ)</option>
                    <option value="SP">São Paulo (SP)</option>
                    <option value="MG">Minas Gerais (MG)</option>
                    <option value="ES">Espírito Santo (ES)</option>
                    <option value="PR">Paraná (PR)</option>
                    <option value="SC">Santa Catarina (SC)</option>
                    <option value="RS">Rio Grande do Sul (RS)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Nova Unidade</span>
                </button>
              </div>
            </form>
          ) : (
            /* TENANTS LIST */
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Unidades / Empresas Cadastradas ({tenants.length}):
                </p>
                <span className="text-[11px] text-slate-500">
                  Isolamento total de produtos, notas fiscais, vendas e caixa
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {tenants.map((tenant) => {
                  const isActive = tenant.id === currentTenant.id;
                  const tenantUserCount = users.filter((u) => !u.tenantIds || u.tenantIds.includes(tenant.id) || u.tenantIds.includes('all')).length;

                  return (
                    <div
                      key={tenant.id}
                      className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        isActive
                          ? 'bg-rose-50/60 border-rose-400 ring-2 ring-rose-500/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className={`p-3 rounded-2xl text-xl shrink-0 ${
                          isActive ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700'
                        }`}>
                          🏢
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h5 className="text-sm font-black text-slate-900 truncate">
                              {tenant.name}
                            </h5>
                            {tenant.isMaster && (
                              <span className="text-[9px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.2 rounded-full">
                                Matriz
                              </span>
                            )}
                            <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.2 rounded border border-slate-200">
                              {tenant.code}
                            </span>
                          </div>

                          <div className="mt-1 flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              {tenant.city} - {tenant.state}
                            </span>
                            <span className="font-mono">CNPJ: {tenant.cnpj}</span>
                            <span className="text-slate-600 font-semibold">
                              👥 {tenantUserCount} usuário(s)
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        {isActive ? (
                          <span className="px-3 py-2 rounded-xl bg-emerald-100 text-emerald-800 font-black text-xs border border-emerald-300 flex items-center gap-1.5">
                            <Check className="w-4 h-4 text-emerald-600" />
                            <span>Unidade Selecionada</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSelectTenant(tenant.id)}
                            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-rose-600 text-white font-extrabold text-xs shadow-xs transition-colors flex items-center gap-1.5"
                          >
                            <span>Acessar Esta Unidade</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {checkPermission('canManageUsers') && !tenant.isMaster && (
                          <button
                            type="button"
                            onClick={() => handleDeleteTenant(tenant)}
                            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Remover Unidade"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Dados totalmente segregados por empresa
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition-colors"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
