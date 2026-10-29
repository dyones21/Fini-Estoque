import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Plus,
  Edit2,
  Building,
  Phone,
  Mail,
  MapPin,
  FileText,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { Supplier } from '../types';
import { authFetch } from '../utils/apiAuth';
import { getFriendlyErrorMessage } from '../utils/errorHandler';
import { maskCnpj, maskPhone } from '../utils/maskUtils';
import { PaginationControls } from './PaginationControls';
import { FilterCollapseBar } from './FilterCollapseBar';

interface SuppliersViewProps {
  onSelectSupplier?: (supplierId: string) => void;
}

export const SuppliersView: React.FC<SuppliersViewProps> = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isFiltersOpen, setIsFiltersOpen] = useState<boolean>(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    cnpj: '',
    phone: '',
    email: '',
    address: '',
  });
  const [modalError, setModalError] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const fetchSuppliers = async () => {
    try {
      setIsLoading(true);
      const res = await authFetch('/api/suppliers');
      if (!res.ok) throw new Error('Falha ao buscar fornecedores');
      const data = await res.json();
      setSuppliers(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [isModalOpen]);

  const handleOpenCreate = () => {
    setEditingSupplier(null);
    setFormData({
      name: '',
      cnpj: '',
      phone: '',
      email: '',
      address: '',
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (s: Supplier) => {
    setEditingSupplier(s);
    setFormData({
      name: s.name,
      cnpj: maskCnpj(s.cnpj || ''),
      phone: maskPhone(s.phone || ''),
      email: s.email || '',
      address: s.address || '',
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (!formData.name.trim()) {
      setModalError('Nome da empresa/fornecedor é obrigatório.');
      return;
    }

    try {
      setIsSaving(true);
      const url = editingSupplier ? `/api/suppliers/${editingSupplier.id}` : '/api/suppliers';
      const method = editingSupplier ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erro ao salvar fornecedor.');
      }

      setIsModalOpen(false);
      await fetchSuppliers();
    } catch (err: any) {
      setModalError(getFriendlyErrorMessage(err, 'Erro ao salvar dados do fornecedor.'));
    } finally {
      setIsSaving(false);
    }
  };

  const filteredSuppliers = suppliers.filter((s) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      s.name.toLowerCase().includes(term) ||
      (s.cnpj && s.cnpj.toLowerCase().includes(term)) ||
      (s.email && s.email.toLowerCase().includes(term)) ||
      (s.phone && s.phone.toLowerCase().includes(term))
    );
  });

  // Pagination State (Default 50 items per page)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const paginatedSuppliers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSuppliers.slice(start, start + pageSize);
  }, [filteredSuppliers, currentPage, pageSize]);

  if (isModalOpen) {
    return (
      <div className="w-full max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
        {/* Navigation & Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false);
                setModalError('');
              }}
              className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center justify-center shrink-0"
              title="Voltar para a lista de fornecedores"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  {editingSupplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
                  {editingSupplier ? 'Edição' : 'Cadastro'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {editingSupplier
                  ? 'Atualize os dados cadastrais e de contato do fornecedor'
                  : 'Cadastre uma nova empresa ou parceiro comercial no sistema'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false);
                setModalError('');
              }}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-colors"
            >
              Cancelar e Voltar
            </button>
            <button
              type="submit"
              form="supplier-dedicated-form"
              disabled={isSaving}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-colors disabled:opacity-50"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{editingSupplier ? 'Atualizar Fornecedor' : 'Salvar Fornecedor'}</span>
            </button>
          </div>
        </div>

        {/* Dedicated Form Card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-indigo-300">
                <Building className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black">Dados Cadastrais e Fiscais</h2>
                <p className="text-xs text-slate-400">
                  Identificação da empresa parceira, documentos e meios de contato
                </p>
              </div>
            </div>
          </div>

          <form id="supplier-dedicated-form" onSubmit={handleSave} className="p-6 space-y-5">
            {modalError && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span className="font-semibold">{modalError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Razão Social / Nome Fantasia <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Fini Brasil Comércio de Alimentos Ltda"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full text-sm p-3 rounded-xl border border-slate-200 font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  CNPJ
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                  value={formData.cnpj}
                  onChange={(e) => setFormData({ ...formData, cnpj: maskCnpj(e.target.value) })}
                  className="w-full text-sm p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono tracking-wide"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Telefone / WhatsApp (com DDD)
                </label>
                <input
                  type="text"
                  inputMode="tel"
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: maskPhone(e.target.value) })}
                  className="w-full text-sm p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono tracking-wide"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  E-mail de Contato / Cobrança
                </label>
                <input
                  type="email"
                  placeholder="financeiro@fornecedor.com.br"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full text-sm p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Endereço Completo
                </label>
                <input
                  type="text"
                  placeholder="Rua, número, bairro, cidade - UF"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full text-sm p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="pt-5 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setModalError('');
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-xs transition-colors disabled:opacity-50"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{editingSupplier ? 'Atualizar Fornecedor' : 'Cadastrar Fornecedor'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-full min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600">
            <Building className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Fornecedores</h1>
            <p className="text-xs text-slate-500 font-medium">
              Cadastro e gerenciamento de fornecedores parceiros
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Fornecedor</span>
        </button>
      </div>

      {/* Filter Bar */}
      <FilterCollapseBar
        isOpen={isFiltersOpen}
        onToggle={() => setIsFiltersOpen(!isFiltersOpen)}
        activeCount={searchTerm.trim() ? 1 : 0}
        onClear={() => setSearchTerm('')}
        label="Opções de Busca e Filtros de Fornecedores"
      >
        <div className="relative w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, CNPJ, e-mail ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-9 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </FilterCollapseBar>

      {/* Suppliers Container (Desktop Table + Mobile Cards) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {/* DESKTOP TABLE VIEW */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-600">
                <th className="py-3.5 px-4">Fornecedor</th>
                <th className="py-3.5 px-4">CNPJ</th>
                <th className="py-3.5 px-4">Telefone</th>
                <th className="py-3.5 px-4">E-mail</th>
                <th className="py-3.5 px-4">Endereço</th>
                <th className="py-3.5 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                    Carregando fornecedores...
                  </td>
                </tr>
              ) : paginatedSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Nenhum fornecedor encontrado.
                  </td>
                </tr>
              ) : (
                paginatedSuppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{s.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                      {s.cnpj ? maskCnpj(s.cnpj) : '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {s.phone ? (
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{maskPhone(s.phone)}</span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {s.email ? (
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{s.email}</span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={s.address || ''}>
                      {s.address || '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleOpenEdit(s)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title="Editar Fornecedor"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARDS VIEW */}
        <div className="block md:hidden p-3 space-y-3 bg-slate-50/50">
          {isLoading ? (
            <div className="py-8 text-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
              Carregando fornecedores...
            </div>
          ) : paginatedSuppliers.length === 0 ? (
            <p className="py-6 text-center text-slate-400 text-xs">
              Nenhum fornecedor encontrado.
            </p>
          ) : (
            paginatedSuppliers.map((s) => (
              <div
                key={s.id}
                className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs space-y-2.5 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0 border border-indigo-100">
                      <Building className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-extrabold text-slate-900 text-sm block">
                        {s.name}
                      </span>
                      {s.cnpj && (
                        <span className="text-[11px] font-mono text-slate-500 block">
                          CNPJ: {maskCnpj(s.cnpj)}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenEdit(s)}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 transition-colors"
                    title="Editar Fornecedor"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Telefone</span>
                    <span className="font-mono text-slate-700">{s.phone ? maskPhone(s.phone) : '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">E-mail</span>
                    <span className="text-slate-700 truncate block" title={s.email || ''}>{s.email || '—'}</span>
                  </div>
                </div>

                {s.address && (
                  <p className="text-[10px] text-slate-500 truncate pt-1 border-t border-slate-100" title={s.address}>
                    📍 {s.address}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Pagination Controls */}
      {filteredSuppliers.length > 0 && (
        <PaginationControls
          currentPage={currentPage}
          totalItems={filteredSuppliers.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          itemName="fornecedores"
        />
      )}
    </div>
  );
};
