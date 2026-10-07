import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  Plus,
  Filter,
  Search,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  Ban,
  Building,
  Edit2,
  Trash2,
  FileSpreadsheet,
  ArrowDownCircle,
  Undo2,
  Loader2,
  X,
  CreditCard,
  Tag,
  Receipt,
  FileText,
} from 'lucide-react';
import { Payable, Supplier, PayablePayment, PayableStatus, PAYABLE_CATEGORIES } from '../types';
import { authFetch } from '../utils/apiAuth';
import { formatCurrency, parseNumber } from '../utils/inventoryUtils';
import { exportToExcel } from '../utils/exportUtils';
import { getFriendlyErrorMessage } from '../utils/errorHandler';

interface PayablesViewProps {
  initialFilterStatus?: string;
  onNavigateToSuppliers?: () => void;
}

export const PayablesView: React.FC<PayablesViewProps> = ({
  initialFilterStatus,
  onNavigateToSuppliers,
}) => {
  const [payables, setPayables] = useState<Payable[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    if (initialFilterStatus) return initialFilterStatus;
    try {
      const saved = sessionStorage.getItem('FINI_PAYABLES_FILTER');
      if (saved) {
        sessionStorage.removeItem('FINI_PAYABLES_FILTER');
        return saved;
      }
    } catch {}
    return 'todos';
  });
  const [supplierFilter, setSupplierFilter] = useState<string>('todos');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Create / Edit Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingPayable, setEditingPayable] = useState<Payable | null>(null);
  const [formData, setFormData] = useState({
    supplierId: '',
    description: '',
    category: 'Mercadoria/Fornecedor',
    documentNumber: '',
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    originalAmount: '',
    notes: '',
  });
  const [formError, setFormError] = useState<string>('');
  const [isSavingForm, setIsSavingForm] = useState<boolean>(false);

  // Payment (Baixa) Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [targetPayable, setTargetPayable] = useState<Payable | null>(null);
  const [paymentData, setPaymentData] = useState({
    amountPaid: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    discount: '0,00',
    interest: '0,00',
    paymentMethod: 'Pix',
    notes: '',
  });
  const [paymentError, setPaymentError] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);

  // Details Modal (to see payment history & allow voiding/estorno)
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState<boolean>(false);
  const [selectedPayable, setSelectedPayable] = useState<Payable | null>(null);

  // In-app Delete / Cancel Account Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    payable: Payable | null;
    actionType: 'delete' | 'cancel';
    error: string;
    isExecuting: boolean;
  }>({
    isOpen: false,
    payable: null,
    actionType: 'delete',
    error: '',
    isExecuting: false,
  });

  // In-app Void Payment (Estorno) Confirmation Modal State
  const [voidModal, setVoidModal] = useState<{
    isOpen: boolean;
    payableId: string;
    payment: PayablePayment | null;
    error: string;
    isExecuting: boolean;
  }>({
    isOpen: false,
    payableId: '',
    payment: null,
    error: '',
    isExecuting: false,
  });

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Load Data
  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [payablesRes, suppliersRes] = await Promise.all([
        authFetch('/api/payables'),
        authFetch('/api/suppliers'),
      ]);

      if (!payablesRes.ok) throw new Error('Falha ao buscar contas a pagar');
      if (!suppliersRes.ok) throw new Error('Falha ao buscar fornecedores');

      const payablesList = await payablesRes.json();
      const suppliersList = await suppliersRes.json();

      setPayables(payablesList);
      setSuppliers(suppliersList);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (initialFilterStatus) {
      setStatusFilter(initialFilterStatus);
    }
  }, [initialFilterStatus]);

  // Calculations for KPI Cards
  const todayStr = new Date().toISOString().slice(0, 10);
  const next7DaysStr = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const kpis = useMemo(() => {
    let totalOpen = 0;
    let totalOverdue = 0;
    let totalNext7Days = 0;
    let totalPaid = 0;

    for (const p of payables) {
      if (p.status === 'cancelado') continue;
      const remaining = Number(p.remainingAmount ?? (p.originalAmount - p.paidAmount)) || 0;
      totalPaid += Number(p.paidAmount) || 0;

      if (remaining > 0) {
        totalOpen += remaining;
        if (p.dueDate < todayStr) {
          totalOverdue += remaining;
        } else if (p.dueDate >= todayStr && p.dueDate <= next7DaysStr) {
          totalNext7Days += remaining;
        }
      }
    }

    return { totalOpen, totalOverdue, totalNext7Days, totalPaid };
  }, [payables, todayStr, next7DaysStr]);

  // Filtered & Sorted Payables (Nearest dueDate first)
  const filteredPayables = useMemo(() => {
    return payables
      .filter((p) => {
        // Status filter
        if (statusFilter === 'proximos_7_dias') {
          const remaining = Number(p.remainingAmount ?? (p.originalAmount - p.paidAmount)) || 0;
          if (remaining <= 0 || p.dueDate < todayStr || p.dueDate > next7DaysStr || p.status === 'cancelado') return false;
        } else if (statusFilter !== 'todos' && p.status !== statusFilter) {
          return false;
        }
        // Supplier filter
        if (supplierFilter !== 'todos' && p.supplierId !== supplierFilter) return false;
        // Period filter
        if (startDate && p.dueDate < startDate) return false;
        if (endDate && p.dueDate > endDate) return false;
        // Search filter
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const matchDesc = p.description.toLowerCase().includes(term);
          const matchSup = (p.supplierName || '').toLowerCase().includes(term);
          const matchDoc = (p.documentNumber || '').toLowerCase().includes(term);
          const matchCat = p.category.toLowerCase().includes(term);
          if (!matchDesc && !matchSup && !matchDoc && !matchCat) return false;
        }
        return true;
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [payables, statusFilter, supplierFilter, startDate, endDate, searchTerm]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingPayable(null);
    setFormData({
      supplierId: '',
      description: '',
      category: 'Mercadoria/Fornecedor',
      documentNumber: '',
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      originalAmount: '',
      notes: '',
    });
    setFormError('');
    setIsFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (p: Payable) => {
    setEditingPayable(p);
    setFormData({
      supplierId: p.supplierId || '',
      description: p.description,
      category: p.category,
      documentNumber: p.documentNumber || '',
      issueDate: p.issueDate || '',
      dueDate: p.dueDate,
      originalAmount: String(p.originalAmount),
      notes: p.notes || '',
    });
    setFormError('');
    setIsFormModalOpen(true);
  };

  // Save (Create or Update)
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.description.trim()) {
      setFormError('Descrição da conta é obrigatória.');
      return;
    }

    if (!formData.dueDate.trim()) {
      setFormError('Data de vencimento é obrigatória.');
      return;
    }

    const numAmount = parseNumber(formData.originalAmount, 0);
    if (numAmount <= 0) {
      setFormError('Valor original deve ser maior que zero.');
      return;
    }

    try {
      setIsSavingForm(true);
      const url = editingPayable ? `/api/payables/${editingPayable.id}` : '/api/payables';
      const method = editingPayable ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          originalAmount: numAmount,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erro ao salvar conta a pagar.');
      }

      setIsFormModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setFormError(getFriendlyErrorMessage(err, 'Erro ao salvar conta a pagar.'));
    } finally {
      setIsSavingForm(false);
    }
  };

  // Open In-App Confirmation Modal for Cancel / Delete Account
  const handleOpenDeleteOrCancel = (p: Payable) => {
    const hasPayments = p.payments && p.payments.length > 0;
    setConfirmModal({
      isOpen: true,
      payable: p,
      actionType: hasPayments ? 'cancel' : 'delete',
      error: '',
      isExecuting: false,
    });
  };

  // Confirm and Execute Cancel / Delete Account
  const handleConfirmDeleteOrCancel = async () => {
    const { payable, actionType } = confirmModal;
    if (!payable) return;

    try {
      setConfirmModal((prev) => ({ ...prev, isExecuting: true, error: '' }));

      if (actionType === 'cancel') {
        const res = await authFetch(`/api/payables/${payable.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'cancelado' }),
        });
        const errData = !res.ok ? await res.json() : null;
        if (!res.ok) {
          throw new Error(errData?.error || 'Erro ao cancelar conta a pagar.');
        }
        showToast('Conta a pagar cancelada com sucesso.', 'info');
      } else {
        const res = await authFetch(`/api/payables/${payable.id}`, { method: 'DELETE' });
        const errData = !res.ok ? await res.json() : null;
        if (!res.ok) {
          throw new Error(errData?.error || 'Erro ao excluir conta a pagar.');
        }
        showToast('Conta a pagar excluída permanentemente.', 'success');
      }

      setConfirmModal({ isOpen: false, payable: null, actionType: 'delete', error: '', isExecuting: false });
      if (selectedPayable?.id === payable.id) {
        setIsDetailsModalOpen(false);
        setSelectedPayable(null);
      }
      await fetchData();
    } catch (err: any) {
      setConfirmModal((prev) => ({
        ...prev,
        isExecuting: false,
        error: getFriendlyErrorMessage(err, 'Falha ao processar solicitação.'),
      }));
    }
  };

  // Open Payment (Baixa) Modal
  const handleOpenPaymentModal = (p: Payable) => {
    setTargetPayable(p);
    const remaining = p.remainingAmount ?? Math.max(0, p.originalAmount - p.paidAmount);
    setPaymentData({
      amountPaid: String(remaining.toFixed(2)).replace('.', ','),
      paymentDate: new Date().toISOString().slice(0, 10),
      discount: '0,00',
      interest: '0,00',
      paymentMethod: 'Pix',
      notes: '',
    });
    setPaymentError('');
    setIsPaymentModalOpen(true);
  };

  // Submit Payment (Baixa)
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPayable) return;
    setPaymentError('');

    const numAmount = parseNumber(paymentData.amountPaid, 0);
    if (numAmount <= 0) {
      setPaymentError('O valor a pagar deve ser maior que zero.');
      return;
    }

    const numDiscount = parseNumber(paymentData.discount, 0);
    const numInterest = parseNumber(paymentData.interest, 0);

    try {
      setIsSubmittingPayment(true);
      const res = await authFetch(`/api/payables/${targetPayable.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountPaid: numAmount,
          discount: numDiscount,
          interest: numInterest,
          paymentDate: paymentData.paymentDate,
          paymentMethod: paymentData.paymentMethod,
          notes: paymentData.notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erro ao registrar baixa de pagamento.');
      }

      setIsPaymentModalOpen(false);
      showToast('Baixa de pagamento registrada com sucesso!', 'success');
      await fetchData();
    } catch (err: any) {
      setPaymentError(getFriendlyErrorMessage(err, 'Erro ao registrar baixa.'));
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Request Void Payment (Estorno) via In-App Confirmation Modal
  const handleRequestVoidPayment = (payableId: string, payment: PayablePayment) => {
    setVoidModal({
      isOpen: true,
      payableId,
      payment,
      error: '',
      isExecuting: false,
    });
  };

  // Confirm and Execute Void Payment (Estorno)
  const handleConfirmVoidPayment = async () => {
    const { payableId, payment } = voidModal;
    if (!payment) return;

    try {
      setVoidModal((prev) => ({ ...prev, isExecuting: true, error: '' }));
      const res = await authFetch(`/api/payables/${payableId}/payments/${payment.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erro ao estornar baixa de pagamento.');
      }

      // Atualiza selectedPayable com o objeto recalculado
      setSelectedPayable(data);
      setVoidModal({ isOpen: false, payableId: '', payment: null, error: '', isExecuting: false });
      showToast('Baixa estornada com sucesso. Saldo e status recalculados.', 'success');
      await fetchData();
    } catch (err: any) {
      setVoidModal((prev) => ({
        ...prev,
        isExecuting: false,
        error: getFriendlyErrorMessage(err, 'Falha ao estornar baixa.'),
      }));
    }
  };

  // Export to Excel / CSV
  const handleExportExcel = () => {
    if (filteredPayables.length === 0) {
      showToast('Não há contas a pagar no filtro atual para exportar.', 'info');
      return;
    }

    const dataToExport = filteredPayables.map((p) => ({
      Fornecedor: p.supplierName || '—',
      CNPJ: p.supplierCnpj || '—',
      Descrição: p.description,
      Categoria: p.category,
      Documento: p.documentNumber || '—',
      'Data Emissão': p.issueDate || '—',
      Vencimento: p.dueDate,
      'Valor Original (R$)': p.originalAmount,
      'Valor Pago (R$)': p.paidAmount,
      'Saldo Devedor (R$)': p.remainingAmount ?? Math.max(0, p.originalAmount - p.paidAmount),
      Status: getStatusLabel(p.status),
      Observações: p.notes || '',
    }));

    exportToExcel(dataToExport, `contas_a_pagar_${new Date().toISOString().slice(0, 10)}`);
  };

  // Status Styling Helper
  const getStatusBadge = (status: PayableStatus) => {
    switch (status) {
      case 'aberto':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-sky-100 text-sky-800 border border-sky-200">
            <Clock className="w-3 h-3" /> Aberto
          </span>
        );
      case 'vencido':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-200">
            <AlertCircle className="w-3 h-3" /> Vencido
          </span>
        );
      case 'pago_parcial':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-200">
            <ArrowDownCircle className="w-3 h-3" /> Pago Parcial
          </span>
        );
      case 'pago':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> Pago
          </span>
        );
      case 'cancelado':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-slate-100 text-slate-600 border border-slate-200">
            <Ban className="w-3 h-3" /> Cancelado
          </span>
        );
      default:
        return null;
    }
  };

  const getStatusLabel = (status: PayableStatus) => {
    switch (status) {
      case 'aberto':
        return 'Aberto';
      case 'vencido':
        return 'Vencido';
      case 'pago_parcial':
        return 'Pago Parcial';
      case 'pago':
        return 'Pago';
      case 'cancelado':
        return 'Cancelado';
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-sky-600">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Contas a Pagar</h1>
            <p className="text-xs text-slate-500 font-medium">
              Gestão de compromissos financeiros, baixas de fornecedores e controle de vencimentos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs px-3.5 py-2.5 rounded-xl transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Exportar Excel</span>
          </button>

          {onNavigateToSuppliers && (
            <button
              onClick={onNavigateToSuppliers}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3.5 py-2.5 rounded-xl transition-colors"
            >
              <Building className="w-4 h-4 text-slate-500" />
              <span>Fornecedores</span>
            </button>
          )}

          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Conta</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total em Aberto */}
        <div
          onClick={() => setStatusFilter('aberto')}
          className="bg-white p-4 rounded-2xl border border-sky-100 shadow-xs cursor-pointer hover:border-sky-300 transition-all"
        >
          <div className="flex items-center justify-between text-sky-600 mb-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Total em Aberto
            </span>
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-xl font-black text-slate-900">{formatCurrency(kpis.totalOpen)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Saldo devedor total previsto</p>
        </div>

        {/* Total Vencido */}
        <div
          onClick={() => setStatusFilter('vencido')}
          className="bg-white p-4 rounded-2xl border border-rose-100 shadow-xs cursor-pointer hover:border-rose-300 transition-all"
        >
          <div className="flex items-center justify-between text-rose-600 mb-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Total Vencido
            </span>
            <AlertCircle className="w-4 h-4" />
          </div>
          <p className="text-xl font-black text-rose-600">{formatCurrency(kpis.totalOverdue)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Contas com vencimento atrasado</p>
        </div>

        {/* Vencendo em 7 Dias */}
        <div
          onClick={() => setStatusFilter('proximos_7_dias')}
          className="bg-white p-4 rounded-2xl border border-amber-100 shadow-xs cursor-pointer hover:border-amber-300 transition-all"
        >
          <div className="flex items-center justify-between text-amber-600 mb-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Próximos 7 Dias
            </span>
            <Calendar className="w-4 h-4" />
          </div>
          <p className="text-xl font-black text-amber-600">{formatCurrency(kpis.totalNext7Days)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Vencendo nesta semana</p>
        </div>

        {/* Total Já Pago */}
        <div
          onClick={() => setStatusFilter('pago')}
          className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs cursor-pointer hover:border-emerald-300 transition-all"
        >
          <div className="flex items-center justify-between text-emerald-600 mb-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Total Já Pago
            </span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <p className="text-xl font-black text-emerald-600">{formatCurrency(kpis.totalPaid)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Baixas liquidadas</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Input */}
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar descrição, fornecedor, nota..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full py-2 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-sky-500/20"
            >
              <option value="todos">Todos os Status</option>
              <option value="aberto">Aberto</option>
              <option value="vencido">Vencido</option>
              <option value="proximos_7_dias">Vencendo em 7 Dias</option>
              <option value="pago_parcial">Pago Parcial</option>
              <option value="pago">Pago</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>

          {/* Supplier Filter */}
          <div>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="w-full py-2 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-sky-500/20 truncate"
            >
              <option value="todos">Todos os Fornecedores</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Clear */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full py-2 px-2 rounded-xl border border-slate-200 text-xs font-medium"
              title="Vencimento Inicial"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full py-2 px-2 rounded-xl border border-slate-200 text-xs font-medium"
              title="Vencimento Final"
            />
            {(startDate || endDate || statusFilter !== 'todos' || supplierFilter !== 'todos' || searchTerm) && (
              <button
                onClick={() => {
                  setStatusFilter('todos');
                  setSupplierFilter('todos');
                  setStartDate('');
                  setEndDate('');
                  setSearchTerm('');
                }}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 shrink-0"
                title="Limpar Filtros"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Payables Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-600">
                <th className="py-3.5 px-4">Fornecedor / Descrição</th>
                <th className="py-3.5 px-3">Documento</th>
                <th className="py-3.5 px-3 text-center">Vencimento</th>
                <th className="py-3.5 px-3 text-right">Valor Original</th>
                <th className="py-3.5 px-3 text-right">Valor Pago</th>
                <th className="py-3.5 px-3 text-right font-black">Saldo</th>
                <th className="py-3.5 px-3 text-center">Status</th>
                <th className="py-3.5 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-600" />
                    Carregando contas a pagar...
                  </td>
                </tr>
              ) : filteredPayables.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Nenhuma conta a pagar encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredPayables.map((p) => {
                  const remaining =
                    p.remainingAmount ?? Math.max(0, p.originalAmount - p.paidAmount);
                  const isPaid = p.status === 'pago';
                  const isCanceled = p.status === 'cancelado';

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => {
                        setSelectedPayable(p);
                        setIsDetailsModalOpen(true);
                      }}
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{p.description}</span>
                          {p.nfEntryId && (
                            <span className="text-[10px] bg-sky-100 text-sky-800 font-extrabold px-1.5 py-0.2 rounded">
                              NF-e
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                          <span className="font-semibold text-slate-700">
                            {p.supplierName || 'Fornecedor avulso'}
                          </span>
                          <span>•</span>
                          <span>{p.category}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">
                        {p.documentNumber || '—'}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span
                          className={`font-bold ${
                            p.dueDate < todayStr && !isPaid && !isCanceled
                              ? 'text-rose-600'
                              : 'text-slate-700'
                          }`}
                        >
                          {p.dueDate}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right text-slate-700 font-semibold">
                        {formatCurrency(p.originalAmount)}
                      </td>

                      <td className="py-3 px-3 text-right text-slate-600">
                        {formatCurrency(p.paidAmount)}
                      </td>

                      <td className="py-3 px-3 text-right font-black text-slate-900">
                        {formatCurrency(remaining)}
                      </td>

                      <td className="py-3 px-3 text-center">{getStatusBadge(p.status)}</td>

                      <td
                        className="py-3 px-4 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1">
                          {!isPaid && !isCanceled && (
                            <button
                              onClick={() => handleOpenPaymentModal(p)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg shadow-2xs transition-colors"
                              title="Dar Baixa (Pagamento)"
                            >
                              Baixa
                            </button>
                          )}

                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded"
                            title="Editar Conta"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleOpenDeleteOrCancel(p)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                            title={
                              p.payments && p.payments.length > 0
                                ? 'Cancelar Conta'
                                : 'Excluir Conta'
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Create / Edit Account */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in duration-200">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-sky-500/20 border border-sky-400/30 rounded-xl text-sky-300">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black">
                    {editingPayable ? 'Editar Conta a Pagar' : 'Nova Conta a Pagar'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Lançamento de compromisso financeiro com fornecedor
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Fornecedor
                </label>
                <select
                  value={formData.supplierId}
                  onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-bold text-slate-800 focus:ring-2 focus:ring-sky-500/20"
                >
                  <option value="">Selecione um fornecedor cadastrado (opcional)</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.cnpj ? `(${s.cnpj})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Descrição da Conta *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Compra de Gomas Fini, Aluguel Loja, Conta de Luz..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-bold focus:ring-2 focus:ring-sky-500/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Categoria *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-bold text-slate-800 focus:ring-2 focus:ring-sky-500/20"
                  >
                    {PAYABLE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nº do Documento (NF, Boleto)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: NF 12345"
                    value={formData.documentNumber}
                    onChange={(e) => setFormData({ ...formData, documentNumber: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-mono focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Valor Original (R$) *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingPayable?.payments && editingPayable.payments.length > 0)}
                    placeholder="0,00"
                    value={formData.originalAmount}
                    onChange={(e) => setFormData({ ...formData, originalAmount: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-black text-slate-900 focus:ring-2 focus:ring-sky-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                  {editingPayable?.payments && editingPayable.payments.length > 0 && (
                    <span className="text-[10px] text-amber-600 font-bold">
                      Bloqueado (já possui baixas)
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Data Emissão
                  </label>
                  <input
                    type="date"
                    value={formData.issueDate}
                    onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Data Vencimento *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-bold text-rose-600 focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Observações
                </label>
                <textarea
                  rows={2}
                  placeholder="Informações adicionais, chave PIX, banco, etc."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-sky-500/20"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingForm}
                  className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs transition-colors disabled:opacity-50"
                >
                  {isSavingForm && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingPayable ? 'Salvar Alterações' : 'Lançar Conta'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Registrar Baixa (Pagamento Total ou Parcial) */}
      {isPaymentModalOpen && targetPayable && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in duration-200">
            <div className="bg-emerald-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 border border-emerald-400/30 rounded-xl text-emerald-300">
                  <ArrowDownCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Dar Baixa de Pagamento</h3>
                  <p className="text-[11px] text-emerald-200/80">
                    Liquidação total ou parcial da conta
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-emerald-300 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitPayment} className="p-5 space-y-4">
              {paymentError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              {/* Account Summary Banner */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1 text-xs">
                <p className="font-bold text-slate-800">{targetPayable.description}</p>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Fornecedor: {targetPayable.supplierName || '—'}</span>
                  <span>Vencimento: {targetPayable.dueDate}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-200 font-bold">
                  <span className="text-slate-600">Saldo Restante:</span>
                  <span className="text-emerald-700 font-black">
                    {formatCurrency(
                      targetPayable.remainingAmount ??
                        Math.max(0, targetPayable.originalAmount - targetPayable.paidAmount)
                    )}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Valor a Pagar (R$) *
                  </label>
                  <input
                    type="text"
                    required
                    value={paymentData.amountPaid}
                    onChange={(e) => setPaymentData({ ...paymentData, amountPaid: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-black text-emerald-700 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Data do Pagamento *
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentData.paymentDate}
                    onChange={(e) =>
                      setPaymentData({ ...paymentData, paymentDate: e.target.value })
                    }
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Forma de Pagto *
                  </label>
                  <select
                    value={paymentData.paymentMethod}
                    onChange={(e) =>
                      setPaymentData({ ...paymentData, paymentMethod: e.target.value })
                    }
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="Pix">Pix</option>
                    <option value="Boleto">Boleto</option>
                    <option value="Transferência">Transferência</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Cartão">Cartão</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Desconto (R$)
                  </label>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={paymentData.discount}
                    onChange={(e) => setPaymentData({ ...paymentData, discount: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Juros/Multa (R$)
                  </label>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={paymentData.interest}
                    onChange={(e) => setPaymentData({ ...paymentData, interest: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Observações da Baixa
                </label>
                <input
                  type="text"
                  placeholder="Ex: Pago com chave CNPJ, comprovante nº..."
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs transition-colors disabled:opacity-50"
                >
                  {isSubmittingPayment && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirmar Baixa</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Detalhes da Conta & Histórico de Baixas (com Estorno) */}
      {isDetailsModalOpen && selectedPayable && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in duration-200">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-sky-500/20 border border-sky-400/30 rounded-xl text-sky-300">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Detalhes da Conta a Pagar</h3>
                  <p className="text-[11px] text-slate-400">
                    Histórico de lançamentos e baixas registradas
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDetailsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto text-xs">
              {/* Account Summary */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Descrição</span>
                  <p className="font-bold text-slate-800">{selectedPayable.description}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Fornecedor</span>
                  <p className="font-bold text-slate-800">
                    {selectedPayable.supplierName || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Vencimento</span>
                  <p className="font-bold text-slate-800">{selectedPayable.dueDate}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Status</span>
                  <div className="mt-0.5">{getStatusBadge(selectedPayable.status)}</div>
                </div>
              </div>

              {/* Values Breakdown */}
              <div className="p-4 bg-sky-50/50 rounded-2xl border border-sky-100 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">
                    Valor Original
                  </span>
                  <p className="text-lg font-black text-slate-900">
                    {formatCurrency(selectedPayable.originalAmount)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Total Pago</span>
                  <p className="text-lg font-black text-emerald-600">
                    {formatCurrency(selectedPayable.paidAmount)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">
                    Saldo Restante
                  </span>
                  <p className="text-lg font-black text-rose-600">
                    {formatCurrency(
                      selectedPayable.remainingAmount ??
                        Math.max(0, selectedPayable.originalAmount - selectedPayable.paidAmount)
                    )}
                  </p>
                </div>
              </div>

              {/* Payments History Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-slate-800 uppercase tracking-wider text-[11px]">
                    Histórico de Baixas / Pagamentos
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    {selectedPayable.payments?.length || 0} baixa(s)
                  </span>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-black text-slate-600">
                        <th className="py-2.5 px-3">Data</th>
                        <th className="py-2.5 px-3">Forma</th>
                        <th className="py-2.5 px-3 text-right">Valor Pago</th>
                        <th className="py-2.5 px-3 text-right">Desconto</th>
                        <th className="py-2.5 px-3 text-right">Juros</th>
                        <th className="py-2.5 px-3">Operador</th>
                        <th className="py-2.5 px-3 text-center">Estornar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!selectedPayable.payments || selectedPayable.payments.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-slate-400">
                            Nenhuma baixa registrada para esta conta ainda.
                          </td>
                        </tr>
                      ) : (
                        selectedPayable.payments.map((pmt) => (
                          <tr key={pmt.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-semibold text-slate-800">
                              {pmt.paymentDate}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 font-medium">
                              {pmt.paymentMethod}
                            </td>
                            <td className="py-2.5 px-3 text-right font-black text-emerald-700">
                              {formatCurrency(pmt.amountPaid)}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-500">
                              {pmt.discount > 0 ? formatCurrency(pmt.discount) : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-500">
                              {pmt.interest > 0 ? formatCurrency(pmt.interest) : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">{pmt.createdBy || '—'}</td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                onClick={() => handleRequestVoidPayment(selectedPayable.id, pmt)}
                                className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                                title="Estornar esta baixa"
                              >
                                <Undo2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  {selectedPayable.status !== 'pago' && selectedPayable.status !== 'cancelado' && (
                    <button
                      onClick={() => {
                        setIsDetailsModalOpen(false);
                        handleOpenPaymentModal(selectedPayable);
                      }}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
                    >
                      Dar Baixa Agora
                    </button>
                  )}

                  <button
                    onClick={() => {
                      handleOpenDeleteOrCancel(selectedPayable);
                    }}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {selectedPayable.payments && selectedPayable.payments.length > 0
                        ? 'Cancelar Conta'
                        : 'Excluir Conta'}
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: In-App Confirmation Modal (Excluir ou Cancelar Conta) */}
      {confirmModal.isOpen && confirmModal.payable && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in duration-200">
            <div
              className={`p-4 text-white flex items-center justify-between ${
                confirmModal.actionType === 'delete' ? 'bg-rose-950' : 'bg-amber-950'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-xl border ${
                    confirmModal.actionType === 'delete'
                      ? 'bg-rose-600/30 border-rose-500/40 text-rose-300'
                      : 'bg-amber-600/30 border-amber-500/40 text-amber-300'
                  }`}
                >
                  {confirmModal.actionType === 'delete' ? (
                    <Trash2 className="w-4 h-4" />
                  ) : (
                    <Ban className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-black">
                    {confirmModal.actionType === 'delete'
                      ? 'Excluir Conta a Pagar'
                      : 'Cancelar Conta a Pagar'}
                  </h3>
                  <p className="text-[11px] text-slate-300">Confirmação de operação financeira</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setConfirmModal({
                    isOpen: false,
                    payable: null,
                    actionType: 'delete',
                    error: '',
                    isExecuting: false,
                  })
                }
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {confirmModal.error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="font-bold">{confirmModal.error}</span>
                </div>
              )}

              {/* Informações da Conta */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-semibold">Descrição:</span>
                  <span className="font-bold text-slate-800 text-right">
                    {confirmModal.payable.description}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-semibold">Valor Original:</span>
                  <span className="font-black text-slate-900">
                    {formatCurrency(confirmModal.payable.originalAmount)}
                  </span>
                </div>
                {confirmModal.payable.supplierName && (
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">Fornecedor:</span>
                    <span className="font-semibold text-slate-700">
                      {confirmModal.payable.supplierName}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400 font-semibold">Vencimento:</span>
                  <span className="font-semibold text-slate-700">
                    {confirmModal.payable.dueDate}
                  </span>
                </div>
                {confirmModal.payable.paidAmount > 0 && (
                  <div className="flex justify-between pt-1 border-t border-slate-200">
                    <span className="text-slate-400 font-semibold">Valor já baixado:</span>
                    <span className="font-black text-emerald-600">
                      {formatCurrency(confirmModal.payable.paidAmount)}
                    </span>
                  </div>
                )}
              </div>

              {/* Mensagem explicativa */}
              {confirmModal.actionType === 'delete' ? (
                <div className="p-3 bg-rose-50/70 border border-rose-200/80 rounded-xl text-rose-900 leading-relaxed">
                  <p className="font-bold mb-1">Atenção: Ação permanente</p>
                  <p className="text-[11px] text-rose-800">
                    Como esta conta não possui nenhuma baixa registrada, ela será excluída
                    definitivamente do banco de dados.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-amber-900 leading-relaxed">
                  <p className="font-bold mb-1">Conta com baixas registradas</p>
                  <p className="text-[11px] text-amber-800">
                    Esta conta já possui baixas registradas e não pode ser apagada fisicamente para
                    não corromper os saldos contábeis. Seu status será alterado para{' '}
                    <strong>"Cancelado"</strong>.
                  </p>
                </div>
              )}

              {/* Botões de Ação */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={confirmModal.isExecuting}
                  onClick={() =>
                    setConfirmModal({
                      isOpen: false,
                      payable: null,
                      actionType: 'delete',
                      error: '',
                      isExecuting: false,
                    })
                  }
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold transition-colors"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={confirmModal.isExecuting}
                  onClick={handleConfirmDeleteOrCancel}
                  className={`px-4 py-2.5 rounded-xl text-white font-bold transition-all shadow-sm flex items-center gap-1.5 ${
                    confirmModal.actionType === 'delete'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {confirmModal.isExecuting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Processando...</span>
                    </>
                  ) : confirmModal.actionType === 'delete' ? (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir Permanentemente</span>
                    </>
                  ) : (
                    <>
                      <Ban className="w-3.5 h-3.5" />
                      <span>Confirmar Cancelamento</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: In-App Confirmation Modal (Estorno de Baixa) */}
      {voidModal.isOpen && voidModal.payment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in duration-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/20 border border-rose-400/30 text-rose-300">
                  <Undo2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Estornar Baixa de Pagamento</h3>
                  <p className="text-[11px] text-slate-400">Reversão de pagamento registrado</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setVoidModal({
                    isOpen: false,
                    payableId: '',
                    payment: null,
                    error: '',
                    isExecuting: false,
                  })
                }
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {voidModal.error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="font-bold">{voidModal.error}</span>
                </div>
              )}

              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-semibold">Valor Baixado:</span>
                  <span className="font-black text-rose-600 text-sm">
                    {formatCurrency(voidModal.payment.amountPaid)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-semibold">Data do Pagamento:</span>
                  <span className="font-bold text-slate-800">{voidModal.payment.paymentDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-semibold">Forma de Pagamento:</span>
                  <span className="font-bold text-slate-800">{voidModal.payment.paymentMethod}</span>
                </div>
                {voidModal.payment.notes && (
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">Observações:</span>
                    <span className="text-slate-600">{voidModal.payment.notes}</span>
                  </div>
                )}
              </div>

              <p className="text-slate-600 leading-relaxed">
                Tem certeza que deseja estornar esta baixa? O registro de pagamento será removido e
                o <strong>saldo devedor e o status da conta a pagar serão recalculados automaticamente</strong>.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={voidModal.isExecuting}
                  onClick={() =>
                    setVoidModal({
                      isOpen: false,
                      payableId: '',
                      payment: null,
                      error: '',
                      isExecuting: false,
                    })
                  }
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold transition-colors"
                >
                  Voltar
                </button>

                <button
                  type="button"
                  disabled={voidModal.isExecuting}
                  onClick={handleConfirmVoidPayment}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all shadow-sm flex items-center gap-1.5"
                >
                  {voidModal.isExecuting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Estornando...</span>
                    </>
                  ) : (
                    <>
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Confirmar Estorno</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom duration-200 max-w-sm">
          <div
            className={`p-4 rounded-2xl shadow-xl border flex items-center gap-3 text-xs font-bold ${
              toastMessage.type === 'success'
                ? 'bg-emerald-900 text-emerald-100 border-emerald-700'
                : toastMessage.type === 'error'
                ? 'bg-rose-900 text-rose-100 border-rose-700'
                : 'bg-slate-900 text-slate-100 border-slate-700'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : toastMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Receipt className="w-4 h-4 text-sky-400 shrink-0" />
            )}
            <span className="flex-1">{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
