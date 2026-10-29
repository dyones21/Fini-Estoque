import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Repeat,
  Layers,
  CalendarDays,
  ArrowLeft,
} from 'lucide-react';
import { Payable, Supplier, PayablePayment, PayableStatus, PAYABLE_CATEGORIES } from '../types';
import { authFetch } from '../utils/apiAuth';
import { formatCurrency, parseNumber } from '../utils/inventoryUtils';
import { exportToExcel } from '../utils/exportUtils';
import { getFriendlyErrorMessage } from '../utils/errorHandler';
import { maskCurrency, parseCurrencyToNumber, formatDisplayDate } from '../utils/maskUtils';
import { PaginationControls } from './PaginationControls';
import { FilterCollapseBar } from './FilterCollapseBar';

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
  const [isFiltersOpen, setIsFiltersOpen] = useState<boolean>(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchTerm.trim()) count++;
    if (statusFilter !== 'todos') count++;
    if (supplierFilter !== 'todos') count++;
    if (startDate) count++;
    if (endDate) count++;
    return count;
  }, [searchTerm, statusFilter, supplierFilter, startDate, endDate]);

  const handleClearFilters = () => {
    setStatusFilter('todos');
    setSupplierFilter('todos');
    setStartDate('');
    setEndDate('');
    setSearchTerm('');
  };

  // Table Sorting State (Padrão: Vencimento mais próximo primeiro)
  type SortField =
    | 'supplierOrDesc'
    | 'document'
    | 'dueDate'
    | 'originalAmount'
    | 'paidAmount'
    | 'remaining'
    | 'status';
  type SortDirection = 'asc' | 'desc';

  const [sortField, setSortField] = useState<SortField>('dueDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

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
  // Lançamento Parcelado e Recorrente State
  type EntryType = 'unico' | 'parcelado' | 'recorrente';
  type IntervalType = 'semanal' | 'quinzenal' | 'mensal' | 'trimestral' | 'semestral' | 'anual';

  const [entryType, setEntryType] = useState<EntryType>('unico');
  const [installmentsCount, setInstallmentsCount] = useState<number>(2);
  const [recurrenceCount, setRecurrenceCount] = useState<number>(12);
  const [intervalType, setIntervalType] = useState<IntervalType>('mensal');

  function intervalLabel(type: IntervalType): string {
    switch (type) {
      case 'semanal': return 'Semanal';
      case 'quinzenal': return 'Quinzenal';
      case 'mensal': return 'Mensal';
      case 'trimestral': return 'Trimestral';
      case 'semestral': return 'Semestral';
      case 'anual': return 'Anual';
      default: return type;
    }
  }

  function computeIntervalDate(baseDateStr: string, index: number, interval: IntervalType): string {
    if (index === 0) return baseDateStr;
    const parts = baseDateStr.split('-');
    if (parts.length !== 3) return baseDateStr;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    if (interval === 'semanal') {
      const d = new Date(year, month, day);
      d.setDate(d.getDate() + index * 7);
      const yStr = d.getFullYear();
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const dStr = String(d.getDate()).padStart(2, '0');
      return `${yStr}-${mStr}-${dStr}`;
    }

    if (interval === 'quinzenal') {
      const d = new Date(year, month, day);
      d.setDate(d.getDate() + index * 15);
      const yStr = d.getFullYear();
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const dStr = String(d.getDate()).padStart(2, '0');
      return `${yStr}-${mStr}-${dStr}`;
    }

    let monthsMultiplier = 1;
    if (interval === 'trimestral') monthsMultiplier = 3;
    else if (interval === 'semestral') monthsMultiplier = 6;
    else if (interval === 'anual') monthsMultiplier = 12;

    const totalMonths = month + index * monthsMultiplier;
    const targetYear = year + Math.floor(totalMonths / 12);
    const targetMonth = ((totalMonths % 12) + 12) % 12;

    const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const targetDay = Math.min(day, daysInTargetMonth);

    const yStr = String(targetYear).padStart(4, '0');
    const mStr = String(targetMonth + 1).padStart(2, '0');
    const dStr = String(targetDay).padStart(2, '0');
    return `${yStr}-${mStr}-${dStr}`;
  }

  // Helper de análise de lote e rastreamento de parcelas / recorrências
  const parsePayableBatchInfo = (notes?: string | null) => {
    if (!notes) {
      return {
        isBatch: false,
        batchId: null,
        seq: null,
        total: null,
        batchType: null as 'parcelado' | 'recorrente' | null,
        displayTag: null as string | null,
        cleanNotes: '',
      };
    }

    const loteMatch = notes.match(/\[lote:([^\]]+)\]/i);
    const seqMatch = notes.match(/\[(?:seq|parc):(\d+)\/(\d+)\]/i);
    const tipoMatch = notes.match(/\[tipo:(parcelado|recorrente)\]/i);

    const oldParcelaMatch = notes.match(/\[Parcela (\d+) de (\d+) \| ([^\]]+)\]/i);
    const oldRecorrenteMatch = notes.match(/\[Recorrência (\d+) de (\d+) \| ([^\]]+)\]/i);

    let batchId = loteMatch ? loteMatch[1].trim() : null;
    let seq = seqMatch ? parseInt(seqMatch[1], 10) : null;
    let total = seqMatch ? parseInt(seqMatch[2], 10) : null;
    let batchType: 'parcelado' | 'recorrente' | null = tipoMatch
      ? (tipoMatch[1].toLowerCase() as any)
      : null;

    if (!batchId && oldParcelaMatch) {
      seq = parseInt(oldParcelaMatch[1], 10);
      total = parseInt(oldParcelaMatch[2], 10);
      batchType = 'parcelado';
    } else if (!batchId && oldRecorrenteMatch) {
      seq = parseInt(oldRecorrenteMatch[1], 10);
      total = parseInt(oldRecorrenteMatch[2], 10);
      batchType = 'recorrente';
    }

    const isBatch = Boolean(batchId || seq);
    let displayTag: string | null = null;
    if (seq && total) {
      displayTag = batchType === 'recorrente' ? `Recorrente (${seq}/${total})` : `Parcela (${seq}/${total})`;
    } else if (batchType === 'recorrente') {
      displayTag = 'Recorrente';
    } else if (isBatch) {
      displayTag = 'Parcelado';
    }

    const cleanNotes = notes
      .replace(/\[lote:[^\]]+\]/gi, '')
      .replace(/\[(?:seq|parc):\d+\/\d+\]/gi, '')
      .replace(/\[tipo:[^\]]+\]/gi, '')
      .replace(/\[(Parcela|Recorrência) \d+ de \d+ \| [^\]]+\]/gi, '')
      .trim();

    return {
      isBatch,
      batchId,
      seq,
      total,
      batchType,
      displayTag,
      cleanNotes,
    };
  };

  const getRelatedPayablesInSeries = (p: Payable, allList: Payable[]) => {
    const info = parsePayableBatchInfo(p.notes);
    if (!info.isBatch) return [p];

    if (info.batchId) {
      const matched = allList.filter((item) => {
        const itemInfo = parsePayableBatchInfo(item.notes);
        return itemInfo.batchId === info.batchId;
      });
      if (matched.length > 0) return matched;
    }

    // Fallback: se não tiver batchId mas tiver indicação de série no nome ou notas
    const baseDesc = p.description.replace(/\s*\(\d+\/\d+\)/, '').trim().toLowerCase();
    const fallbackList = allList.filter((item) => {
      const itemInfo = parsePayableBatchInfo(item.notes);
      const itemBase = item.description.replace(/\s*\(\d+\/\d+\)/, '').trim().toLowerCase();
      return (
        item.supplierId === p.supplierId &&
        item.category === p.category &&
        itemBase === baseDesc &&
        (itemInfo.isBatch || Boolean(item.description.match(/\(\d+\/\d+\)/)))
      );
    });

    return fallbackList.length > 1 ? fallbackList : [p];
  };

  const [formError, setFormError] = useState<string>('');
  const [isSavingForm, setIsSavingForm] = useState<boolean>(false);

  // Estado para Edição de Séries Vinculadas
  const [editingSeriesPayables, setEditingSeriesPayables] = useState<Payable[]>([]);
  const [futurePendingInSeries, setFuturePendingInSeries] = useState<Payable[]>([]);
  const [editScope, setEditScope] = useState<'single' | 'series_future'>('single');

  // Payment (Baixa) Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [targetPayable, setTargetPayable] = useState<Payable | null>(null);
  const [paymentData, setPaymentData] = useState({
    amountPaid: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    discount: 'R$ 0,00',
    interest: 'R$ 0,00',
    paymentMethod: 'Pix',
    notes: '',
  });
  const [paymentError, setPaymentError] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);

  // Details Modal (to see payment history & allow voiding/estorno)
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState<boolean>(false);
  const [selectedPayable, setSelectedPayable] = useState<Payable | null>(null);

  // In-app Delete / Cancel Account Confirmation Modal State (com suporte a ações em série)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    payable: Payable | null;
    actionType: 'delete' | 'cancel';
    scope: 'single' | 'series';
    seriesCount: number;
    pendingInSeries: Payable[];
    paidInSeriesCount: number;
    error: string;
    isExecuting: boolean;
  }>({
    isOpen: false,
    payable: null,
    actionType: 'delete',
    scope: 'single',
    seriesCount: 0,
    pendingInSeries: [],
    paidInSeriesCount: 0,
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

  useEffect(() => {
    if (isFormModalOpen) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [isFormModalOpen]);

  // Dates for Due Date Tracking
  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrowStr = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const next7DaysStr = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Filtered & Sorted Payables (Padrão: Vencimento mais próximo primeiro)
  const filteredPayables = useMemo(() => {
    const list = payables.filter((p) => {
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
    });

    return list.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'supplierOrDesc': {
          const aKey = (a.supplierName || a.description || '').toLowerCase();
          const bKey = (b.supplierName || b.description || '').toLowerCase();
          comparison = aKey.localeCompare(bKey, 'pt-BR');
          if (comparison === 0) {
            comparison = a.description.toLowerCase().localeCompare(b.description.toLowerCase(), 'pt-BR');
          }
          break;
        }
        case 'document': {
          const aDoc = (a.documentNumber || '').toLowerCase();
          const bDoc = (b.documentNumber || '').toLowerCase();
          comparison = aDoc.localeCompare(bDoc, 'pt-BR', { numeric: true });
          break;
        }
        case 'dueDate': {
          comparison = (a.dueDate || '').localeCompare(b.dueDate || '');
          break;
        }
        case 'originalAmount': {
          comparison = (Number(a.originalAmount) || 0) - (Number(b.originalAmount) || 0);
          break;
        }
        case 'paidAmount': {
          comparison = (Number(a.paidAmount) || 0) - (Number(b.paidAmount) || 0);
          break;
        }
        case 'remaining': {
          const aRem = a.remainingAmount ?? Math.max(0, a.originalAmount - a.paidAmount);
          const bRem = b.remainingAmount ?? Math.max(0, b.originalAmount - b.paidAmount);
          comparison = aRem - bRem;
          break;
        }
        case 'status': {
          comparison = (a.status || '').localeCompare(b.status || '');
          break;
        }
        default:
          comparison = 0;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [
    payables,
    statusFilter,
    supplierFilter,
    startDate,
    endDate,
    searchTerm,
    sortField,
    sortDirection,
    todayStr,
    next7DaysStr,
  ]);

  // Calculations for KPI Cards dynamically based on applied filters
  const kpis = useMemo(() => {
    let totalOpen = 0;
    let totalOverdue = 0;
    let totalNext7Days = 0;
    let totalPaid = 0;

    for (const p of filteredPayables) {
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
  }, [filteredPayables, todayStr, next7DaysStr]);

  // Pagination State (Default 50 items per page)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, supplierFilter, startDate, endDate, searchTerm]);

  // Paginated Payables
  const paginatedPayables = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPayables.slice(start, start + pageSize);
  }, [filteredPayables, currentPage, pageSize]);

  // Prévia das parcelas ou recorrências geradas em tempo real
  const generatedEntriesPreview = useMemo(() => {
    if (editingPayable || entryType === 'unico') return [];
    if (!formData.dueDate) return [];

    const totalAmount = parseCurrencyToNumber(formData.originalAmount);
    const count = entryType === 'parcelado' ? installmentsCount : recurrenceCount;
    if (count < 2) return [];

    const list: Array<{
      index: number;
      label: string;
      description: string;
      documentNumber: string;
      dueDate: string;
      amount: number;
    }> = [];

    if (entryType === 'parcelado') {
      const totalCents = Math.round(totalAmount * 100);
      const baseCents = Math.floor(totalCents / count);
      const remainderCents = totalCents - baseCents * count;

      for (let i = 0; i < count; i++) {
        const itemCents = baseCents + (i === 0 ? remainderCents : 0);
        const itemAmount = itemCents / 100;
        const dueDate = computeIntervalDate(formData.dueDate, i, intervalType);
        const descSuffix = ` (${i + 1}/${count})`;
        const docSuffix = formData.documentNumber ? ` - ${i + 1}/${count}` : '';

        list.push({
          index: i + 1,
          label: `Parcela ${i + 1} de ${count}`,
          description: formData.description ? `${formData.description}${descSuffix}` : `Parcela ${i + 1}/${count}`,
          documentNumber: formData.documentNumber ? `${formData.documentNumber}${docSuffix}` : '',
          dueDate,
          amount: itemAmount,
        });
      }
    } else if (entryType === 'recorrente') {
      for (let i = 0; i < count; i++) {
        const dueDate = computeIntervalDate(formData.dueDate, i, intervalType);
        const descSuffix = ` (${i + 1}/${count})`;
        const docSuffix = formData.documentNumber ? ` - ${i + 1}/${count}` : '';

        list.push({
          index: i + 1,
          label: `Ocorrência ${i + 1} de ${count}`,
          description: formData.description ? `${formData.description}${descSuffix}` : `Recorrência ${i + 1}/${count}`,
          documentNumber: formData.documentNumber ? `${formData.documentNumber}${docSuffix}` : '',
          dueDate,
          amount: totalAmount,
        });
      }
    }

    return list;
  }, [
    editingPayable,
    entryType,
    formData.dueDate,
    formData.originalAmount,
    formData.description,
    formData.documentNumber,
    installmentsCount,
    recurrenceCount,
    intervalType,
  ]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingPayable(null);
    setEntryType('unico');
    setInstallmentsCount(2);
    setRecurrenceCount(12);
    setIntervalType('mensal');
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
    setEntryType('unico');

    const related = getRelatedPayablesInSeries(p, payables);
    const info = parsePayableBatchInfo(p.notes);

    // Contas futuras pendentes desta série (vencimento >= atual e sem baixa registrada)
    const futurePending = related
      .filter((item) => {
        const itemInfo = parsePayableBatchInfo(item.notes);
        const isFutureOrCurrent =
          info.seq && itemInfo.seq ? itemInfo.seq >= info.seq : item.dueDate >= p.dueDate;
        const isPending =
          item.paidAmount === 0 && item.status !== 'pago' && item.status !== 'pago_parcial';
        return isFutureOrCurrent && isPending;
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    setEditingSeriesPayables(related);
    setFuturePendingInSeries(futurePending);
    setEditScope('single');

    setFormData({
      supplierId: p.supplierId || '',
      description: p.description,
      category: p.category,
      documentNumber: p.documentNumber || '',
      issueDate: p.issueDate || '',
      dueDate: p.dueDate,
      originalAmount: maskCurrency(p.originalAmount),
      notes: info.cleanNotes || p.notes || '',
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

    const numAmount = parseCurrencyToNumber(formData.originalAmount);
    if (numAmount <= 0) {
      setFormError('Valor original deve ser maior que zero.');
      return;
    }

    try {
      setIsSavingForm(true);

      // Lançamento em Lote: Parcelado ou Recorrente (com batchId único para rastreamento)
      if (!editingPayable && entryType !== 'unico') {
        if (generatedEntriesPreview.length < 2) {
          setFormError('Configure ao menos 2 parcelas ou recorrências.');
          setIsSavingForm(false);
          return;
        }

        const batchId = `lote_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const totalItems = generatedEntriesPreview.length;

        const batchPayload = generatedEntriesPreview.map((item, idx) => {
          const metaTag = `[lote:${batchId}] [seq:${idx + 1}/${totalItems}] [tipo:${entryType}] [${item.label} | ${intervalLabel(intervalType)}]`;
          return {
            supplierId: formData.supplierId ? formData.supplierId.trim() : null,
            description: item.description,
            category: formData.category,
            documentNumber: item.documentNumber || null,
            issueDate: formData.issueDate || null,
            dueDate: item.dueDate,
            originalAmount: item.amount,
            notes: formData.notes
              ? `${formData.notes.trim()} ${metaTag}`
              : metaTag,
          };
        });

        const res = await authFetch('/api/payables', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batchPayload),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Erro ao lançar parcelas.');
        }

        setIsFormModalOpen(false);
        showToast(
          entryType === 'parcelado'
            ? `${batchPayload.length} parcelas lançadas com sucesso!`
            : `${batchPayload.length} contas recorrentes lançadas com sucesso!`,
          'success'
        );
        await fetchData();
        return;
      }

      // Edição de Série: Alterar esta e todas as parcelas futuras pendentes
      if (editingPayable && editScope === 'series_future' && futurePendingInSeries.length > 1) {
        const currentBatchInfo = parsePayableBatchInfo(editingPayable.notes);
        const currentBatchId = currentBatchInfo.batchId || `lote_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const currentMetaTag = `[lote:${currentBatchId}] [seq:${currentBatchInfo.seq || 1}/${currentBatchInfo.total || futurePendingInSeries.length}] [tipo:${currentBatchInfo.batchType || 'parcelado'}]`;

        const updatedCurrentNotes = formData.notes
          ? `${formData.notes.trim()} ${currentMetaTag}`
          : currentMetaTag;

        // 1. Atualiza a conta selecionada
        const currentRes = await authFetch(`/api/payables/${editingPayable.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            originalAmount: numAmount,
            notes: updatedCurrentNotes,
          }),
        });

        if (!currentRes.ok) {
          const errData = await currentRes.json();
          throw new Error(errData?.error || 'Erro ao atualizar conta selecionada.');
        }

        // 2. Atualiza em cadeia as contas futuras pendentes da série
        const baseDesc = formData.description.replace(/\s*\(\d+\/\d+\)$/, '').trim();
        let updatedCount = 1;

        for (const futureItem of futurePendingInSeries) {
          if (futureItem.id === editingPayable.id) continue;

          const fInfo = parsePayableBatchInfo(futureItem.notes);
          const fMetaTag = `[lote:${currentBatchId}] [seq:${fInfo.seq || 'N'}/${fInfo.total || 'N'}] [tipo:${fInfo.batchType || currentBatchInfo.batchType || 'parcelado'}]`;
          const fNotes = formData.notes
            ? `${formData.notes.trim()} ${fMetaTag}`
            : fMetaTag;

          const fDesc = fInfo.seq && fInfo.total
            ? `${baseDesc} (${fInfo.seq}/${fInfo.total})`
            : (futureItem.description.match(/\(\d+\/\d+\)$/)
                ? `${baseDesc} ${futureItem.description.match(/\(\d+\/\d+\)$/)![0]}`
                : `${baseDesc} - ${formatDisplayDate(futureItem.dueDate)}`);

          const fRes = await authFetch(`/api/payables/${futureItem.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              supplierId: formData.supplierId ? formData.supplierId.trim() : null,
              description: fDesc,
              category: formData.category,
              originalAmount: numAmount,
              notes: fNotes,
            }),
          });
          if (fRes.ok) updatedCount++;
        }

        setIsFormModalOpen(false);
        showToast(`${updatedCount} parcelas da série atualizadas com sucesso!`, 'success');
        await fetchData();
        return;
      }

      // Lançamento Único ou Edição de Parcela Individual
      const url = editingPayable ? `/api/payables/${editingPayable.id}` : '/api/payables';
      const method = editingPayable ? 'PUT' : 'POST';

      let finalNotes = formData.notes;
      if (editingPayable) {
        const pInfo = parsePayableBatchInfo(editingPayable.notes);
        if (pInfo.isBatch) {
          const preservedMeta = `[lote:${pInfo.batchId || 'grp_' + editingPayable.id}] [seq:${pInfo.seq || 1}/${pInfo.total || 1}] [tipo:${pInfo.batchType || 'parcelado'}]`;
          finalNotes = formData.notes ? `${formData.notes.trim()} ${preservedMeta}` : preservedMeta;
        }
      }

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          originalAmount: numAmount,
          notes: finalNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erro ao salvar conta a pagar.');
      }

      setIsFormModalOpen(false);
      showToast(editingPayable ? 'Conta atualizada com sucesso!' : 'Conta lançada com sucesso!', 'success');
      await fetchData();
    } catch (err: any) {
      setFormError(getFriendlyErrorMessage(err, 'Erro ao salvar conta a pagar.'));
    } finally {
      setIsSavingForm(false);
    }
  };

  // Open In-App Confirmation Modal for Cancel / Delete Account
  const handleOpenDeleteOrCancel = (p: Payable, forceAction?: 'delete' | 'cancel') => {
    const related = getRelatedPayablesInSeries(p, payables);
    const paidInSeries = related.filter(
      (item) => item.paidAmount > 0 || item.status === 'pago' || item.status === 'pago_parcial'
    );
    const pendingInSeries = related.filter(
      (item) => item.paidAmount === 0 && item.status !== 'pago' && item.status !== 'pago_parcial'
    );

    setConfirmModal({
      isOpen: true,
      payable: p,
      actionType: forceAction || 'delete',
      scope: 'single',
      seriesCount: related.length,
      pendingInSeries,
      paidInSeriesCount: paidInSeries.length,
      error: '',
      isExecuting: false,
    });
  };

  // Confirm and Execute Cancel / Delete Account (com suporte a escopo individual ou lote de série)
  const handleConfirmDeleteOrCancel = async () => {
    const { payable, actionType, scope, pendingInSeries, paidInSeriesCount } = confirmModal;
    if (!payable) return;

    try {
      setConfirmModal((prev) => ({ ...prev, isExecuting: true, error: '' }));

      if (scope === 'series' && pendingInSeries.length > 1) {
        let successCount = 0;
        for (const target of pendingInSeries) {
          if (actionType === 'cancel') {
            const res = await authFetch(`/api/payables/${target.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'cancelado' }),
            });
            if (res.ok) successCount++;
          } else {
            const res = await authFetch(`/api/payables/${target.id}`, { method: 'DELETE' });
            if (res.ok) successCount++;
          }
        }

        const paidNotice = paidInSeriesCount > 0 ? ` (${paidInSeriesCount} paga(s) foram preservadas)` : '';
        showToast(
          actionType === 'delete'
            ? `${successCount} parcelas da série excluídas com sucesso!${paidNotice}`
            : `${successCount} parcelas da série canceladas com sucesso!${paidNotice}`,
          'success'
        );
      } else {
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
      }

      setConfirmModal({
        isOpen: false,
        payable: null,
        actionType: 'delete',
        scope: 'single',
        seriesCount: 0,
        pendingInSeries: [],
        paidInSeriesCount: 0,
        error: '',
        isExecuting: false,
      });

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
      amountPaid: maskCurrency(remaining),
      paymentDate: new Date().toISOString().slice(0, 10),
      discount: 'R$ 0,00',
      interest: 'R$ 0,00',
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

    const numAmount = parseCurrencyToNumber(paymentData.amountPaid);
    if (numAmount <= 0) {
      setPaymentError('O valor a pagar deve ser maior que zero.');
      return;
    }

    const numDiscount = parseCurrencyToNumber(paymentData.discount);
    const numInterest = parseCurrencyToNumber(paymentData.interest);

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

  if (isFormModalOpen) {
    return (
      <div className="w-full max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
        {/* Navigation & Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setIsFormModalOpen(false);
                setFormError('');
              }}
              className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center justify-center shrink-0"
              title="Voltar para a lista de contas"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  {editingPayable ? 'Editar Conta a Pagar' : 'Nova Conta a Pagar'}
                </h1>
                {!editingPayable && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-sky-100 text-sky-800">
                    {entryType === 'unico' ? 'Lançamento Único' : entryType === 'parcelado' ? 'Parcelado' : 'Recorrente'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {editingPayable
                  ? 'Altere as informações da conta a pagar selecionada'
                  : 'Cadastre um novo compromisso financeiro, despesa operacional ou pagamento de fornecedor'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsFormModalOpen(false);
                setFormError('');
              }}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-colors"
            >
              Cancelar e Voltar
            </button>
            <button
              type="submit"
              form="payable-dedicated-form"
              disabled={isSavingForm}
              className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-colors disabled:opacity-50"
            >
              {isSavingForm ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{editingPayable ? 'Salvar Alterações' : 'Salvar Conta a Pagar'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Dedicated Form Card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 sm:p-8">
          <form id="payable-dedicated-form" onSubmit={handleSaveForm} className="space-y-6">
            {formError && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5 animate-in fade-in">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span className="font-semibold">{formError}</span>
              </div>
            )}

            {/* Scope Selection for Recurring/Installment series when editing */}
            {editingPayable && futurePendingInSeries.length > 1 && (
              <div className="p-4 bg-sky-50/70 border border-sky-200 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-sky-900">
                  <Layers className="w-4 h-4 text-sky-600" />
                  <span>Esta conta faz parte de uma série ({futurePendingInSeries.length} parcelas futuras pendentes)</span>
                </div>
                <p className="text-[11px] text-sky-700">
                  Escolha se deseja atualizar somente esta conta ou propagar as alterações (descrição, categoria, valor, etc.) para todas as próximas pendentes da série.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <label
                    onClick={() => setEditScope('single')}
                    className={`p-3 rounded-xl border cursor-pointer text-xs flex items-center gap-2 transition-all ${
                      editScope === 'single'
                        ? 'bg-white border-sky-500 font-bold text-sky-900 shadow-xs'
                        : 'bg-white/50 border-slate-200 text-slate-600 hover:bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="editScope"
                      checked={editScope === 'single'}
                      onChange={() => setEditScope('single')}
                      className="text-sky-600"
                    />
                    <span>Apenas esta conta</span>
                  </label>
                  <label
                    onClick={() => setEditScope('series_future')}
                    className={`p-3 rounded-xl border cursor-pointer text-xs flex items-center gap-2 transition-all ${
                      editScope === 'series_future'
                        ? 'bg-white border-sky-500 font-bold text-sky-900 shadow-xs'
                        : 'bg-white/50 border-slate-200 text-slate-600 hover:bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="editScope"
                      checked={editScope === 'series_future'}
                      onChange={() => setEditScope('series_future')}
                      className="text-sky-600"
                    />
                    <span>Esta e todas as {futurePendingInSeries.length} futuras pendentes</span>
                  </label>
                </div>
              </div>
            )}

            {/* Entry Type selector when creating */}
            {!editingPayable && (
              <div className="space-y-2">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                  Tipo de Lançamento
                </label>
                <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => setEntryType('unico')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                      entryType === 'unico'
                        ? 'bg-white text-sky-900 shadow-xs border border-slate-200/60'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Receipt className="w-4 h-4 text-sky-600" />
                    <span>Único</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryType('parcelado')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                      entryType === 'parcelado'
                        ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/60'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <span>Parcelado</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryType('recorrente')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                      entryType === 'recorrente'
                        ? 'bg-white text-emerald-900 shadow-xs border border-slate-200/60'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Repeat className="w-4 h-4 text-emerald-600" />
                    <span>Recorrente</span>
                  </button>
                </div>
              </div>
            )}

            {/* Row 1: Fornecedor e Categoria */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-slate-500" />
                  <span>Fornecedor</span>
                </label>
                <select
                  value={formData.supplierId}
                  onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
                >
                  <option value="">Sem Fornecedor Vinculado (Geral / Outros)</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.cnpj ? `(${s.cnpj})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-slate-500" />
                  <span>Categoria de Despesa</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
                >
                  {PAYABLE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: Descrição e Documento */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Descrição da Conta *</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Compra de Mercadorias, Aluguel Loja, Conta de Energia, etc."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nº Documento / NF
                </label>
                <input
                  type="text"
                  placeholder="Ex: NF-12345"
                  value={formData.documentNumber}
                  onChange={(e) => setFormData({ ...formData, documentNumber: e.target.value })}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
                />
              </div>
            </div>

            {/* Row 3: Datas e Valor */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Data de Emissão</span>
                </label>
                <input
                  type="date"
                  value={formData.issueDate}
                  onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-amber-900 mb-1 flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-amber-600" />
                  <span>Data de Vencimento *</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-amber-300 bg-amber-50/50 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-bold text-amber-950"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-sky-900 mb-1 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-sky-600" />
                  <span>
                    {entryType === 'parcelado'
                      ? 'Valor Total das Parcelas *'
                      : entryType === 'recorrente'
                      ? 'Valor por Ocorrência *'
                      : 'Valor Original *'}
                  </span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="R$ 0,00"
                  value={formData.originalAmount}
                  onChange={(e) =>
                    setFormData({ ...formData, originalAmount: maskCurrency(e.target.value) })
                  }
                  className="w-full text-xs p-2.5 rounded-xl border border-sky-300 bg-sky-50/50 focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-black text-sky-950"
                />
              </div>
            </div>

            {/* Configurações de Parcelas / Recorrência (quando em lote e criando) */}
            {!editingPayable && entryType !== 'unico' && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    {entryType === 'parcelado' ? (
                      <>
                        <Layers className="w-4 h-4 text-indigo-600" />
                        <span>Configuração do Parcelamento</span>
                      </>
                    ) : (
                      <>
                        <Repeat className="w-4 h-4 text-emerald-600" />
                        <span>Configuração da Recorrência</span>
                      </>
                    )}
                  </h3>
                  <span className="text-[11px] text-slate-500 font-semibold">
                    {entryType === 'parcelado'
                      ? `${installmentsCount} parcelas calculadas`
                      : `${recurrenceCount} ocorrências programadas`}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {entryType === 'parcelado' ? (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Número de Parcelas
                      </label>
                      <select
                        value={installmentsCount}
                        onChange={(e) => setInstallmentsCount(parseInt(e.target.value, 10))}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-bold"
                      >
                        {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24, 36, 48, 60, 72].map((n) => (
                          <option key={n} value={n}>
                            {n}x parcelas
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Quantidade de Repetições
                      </label>
                      <select
                        value={recurrenceCount}
                        onChange={(e) => setRecurrenceCount(parseInt(e.target.value, 10))}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-bold"
                      >
                        {[2, 3, 4, 5, 6, 12, 18, 24, 36, 48, 60].map((n) => (
                          <option key={n} value={n}>
                            {n} repetições ({n} meses/períodos)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Intervalo de Repetição
                    </label>
                    <select
                      value={intervalType}
                      onChange={(e) => setIntervalType(e.target.value as IntervalType)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-bold"
                    >
                      <option value="mensal">Mensal (Padrão - A cada 30 dias)</option>
                      <option value="quinzenal">Quinzenal (A cada 15 dias)</option>
                      <option value="semanal">Semanal (A cada 7 dias)</option>
                      <option value="trimestral">Trimestral (A cada 3 meses)</option>
                      <option value="semestral">Semanal (A cada 6 meses)</option>
                      <option value="anual">Anual (A cada 12 meses)</option>
                    </select>
                  </div>
                </div>

                {/* Pré-visualização das Parcelas */}
                {generatedEntriesPreview.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <p className="text-[11px] font-bold text-slate-600">
                      Pré-visualização dos Vencimentos:
                    </p>
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                      {generatedEntriesPreview.map((item) => (
                        <div
                          key={item.index}
                          className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-600">
                              {item.index}
                            </span>
                            <span className="font-semibold text-slate-800">{item.description}</span>
                          </div>
                          <div className="flex items-center gap-4 text-right">
                            <span className="text-slate-500 text-[11px]">
                              Venc: <strong className="text-slate-700">{formatDisplayDate(item.dueDate)}</strong>
                            </span>
                            <span className="font-bold text-sky-800">
                              {formatCurrency(item.amount)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Observações */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Observações Adicionais (opcional)
              </label>
              <textarea
                rows={3}
                placeholder="Ex: Condições acordadas com o fornecedor, dados bancários para transferência Pix, centro de custo, etc."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
              />
            </div>

            {/* Bottom Actions Bar */}
            <div className="pt-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsFormModalOpen(false);
                  setFormError('');
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold transition-colors"
              >
                Cancelar e Voltar
              </button>
              <button
                type="submit"
                disabled={isSavingForm}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-xs transition-colors disabled:opacity-50"
              >
                {isSavingForm ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{editingPayable ? 'Salvar Alterações' : 'Salvar Conta a Pagar'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Floating Toast Notification if open */}
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
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden">
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
          onClick={() => setStatusFilter(statusFilter === 'aberto' ? 'todos' : 'aberto')}
          className={`bg-white p-4 rounded-2xl border shadow-xs cursor-pointer transition-all ${
            statusFilter === 'aberto'
              ? 'border-sky-400 ring-2 ring-sky-500/20 bg-sky-50/20'
              : 'border-sky-100 hover:border-sky-300'
          }`}
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
          onClick={() => setStatusFilter(statusFilter === 'vencido' ? 'todos' : 'vencido')}
          className={`bg-white p-4 rounded-2xl border shadow-xs cursor-pointer transition-all ${
            statusFilter === 'vencido'
              ? 'border-rose-400 ring-2 ring-rose-500/20 bg-rose-50/20'
              : 'border-rose-100 hover:border-rose-300'
          }`}
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
          onClick={() => setStatusFilter(statusFilter === 'proximos_7_dias' ? 'todos' : 'proximos_7_dias')}
          className={`bg-white p-4 rounded-2xl border shadow-xs cursor-pointer transition-all ${
            statusFilter === 'proximos_7_dias'
              ? 'border-amber-400 ring-2 ring-amber-500/20 bg-amber-50/20'
              : 'border-amber-100 hover:border-amber-300'
          }`}
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
          onClick={() => setStatusFilter(statusFilter === 'pago' ? 'todos' : 'pago')}
          className={`bg-white p-4 rounded-2xl border shadow-xs cursor-pointer transition-all ${
            statusFilter === 'pago'
              ? 'border-emerald-400 ring-2 ring-emerald-500/20 bg-emerald-50/20'
              : 'border-emerald-100 hover:border-emerald-300'
          }`}
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

      {/* Filter Toolbar - Collapsed by Default */}
      <FilterCollapseBar
        isOpen={isFiltersOpen}
        onToggle={() => setIsFiltersOpen(!isFiltersOpen)}
        activeCount={activeFiltersCount}
        onClear={handleClearFilters}
        label="Opções de Filtros de Contas a Pagar"
      >
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5 w-full pt-1 flex-wrap">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar descrição, fornecedor, nota..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            />
          </div>

          {/* Status Filter */}
          <div className="w-full sm:w-auto shrink-0 sm:min-w-[140px]">
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
          <div className="w-full sm:w-auto shrink-0 sm:min-w-[155px] sm:max-w-[210px]">
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

          {/* NOVO: Seletor de Dia Específico (Hoje, Amanhã, Data Pontual) */}
          <div className="flex items-center gap-1.5 shrink-0 bg-slate-50/80 p-1 rounded-xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 pl-1 flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
              Dia:
            </span>
            <button
              type="button"
              onClick={() => {
                if (startDate === todayStr && endDate === todayStr) {
                  setStartDate('');
                  setEndDate('');
                } else {
                  setStartDate(todayStr);
                  setEndDate(todayStr);
                }
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                startDate === todayStr && endDate === todayStr
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
              title="Filtrar contas com vencimento hoje"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => {
                if (startDate === tomorrowStr && endDate === tomorrowStr) {
                  setStartDate('');
                  setEndDate('');
                } else {
                  setStartDate(tomorrowStr);
                  setEndDate(tomorrowStr);
                }
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                startDate === tomorrowStr && endDate === tomorrowStr
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
              title="Filtrar contas com vencimento amanhã"
            >
              Amanhã
            </button>
            <input
              type="date"
              value={startDate && startDate === endDate ? startDate : ''}
              onChange={(e) => {
                const val = e.target.value;
                setStartDate(val);
                setEndDate(val);
              }}
              className="w-[124px] py-1.5 px-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sky-500"
              title="Selecionar um dia específico"
            />
          </div>

          {/* Date Range (Mantido exatamente como já existe) */}
          <div className="flex items-center gap-1.5 shrink-0 bg-slate-50/80 p-1 rounded-xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 pl-1">Período:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[124px] py-1.5 px-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sky-500"
              title="Vencimento Inicial"
            />
            <span className="text-[11px] text-slate-400 font-bold px-0.5">até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[124px] py-1.5 px-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sky-500"
              title="Vencimento Final"
            />
          </div>

          {/* Clear Filters Button */}
          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="py-2 px-3 text-sky-600 hover:text-sky-700 hover:bg-sky-50 rounded-xl border border-sky-200 text-xs font-bold shrink-0 transition-colors flex items-center justify-center gap-1.5"
              title="Limpar Filtros"
            >
              <X className="w-3.5 h-3.5" />
              <span>Limpar</span>
            </button>
          )}
        </div>
      </FilterCollapseBar>

      {/* Payables Container (Desktop Table + Mobile Cards) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {/* DESKTOP TABLE VIEW */}
        <div className="hidden md:block overflow-x-auto">
          {/* Table */}
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-600">
                <th
                  onClick={() => handleSort('supplierOrDesc')}
                  className="py-3.5 px-4 select-none cursor-pointer group hover:bg-slate-100 transition-colors text-left"
                  title="Ordenar por Fornecedor / Descrição"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span className={sortField === 'supplierOrDesc' ? 'text-sky-700 font-black' : 'group-hover:text-slate-900'}>
                      Fornecedor / Descrição
                    </span>
                    {sortField === 'supplierOrDesc' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-sky-600" /> : <ArrowDown className="w-3.5 h-3.5 text-sky-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-500" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('document')}
                  className="py-3.5 px-3 select-none cursor-pointer group hover:bg-slate-100 transition-colors text-left"
                  title="Ordenar por Documento"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span className={sortField === 'document' ? 'text-sky-700 font-black' : 'group-hover:text-slate-900'}>
                      Documento
                    </span>
                    {sortField === 'document' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-sky-600" /> : <ArrowDown className="w-3.5 h-3.5 text-sky-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-500" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('dueDate')}
                  className="py-3.5 px-3 select-none cursor-pointer group hover:bg-slate-100 transition-colors text-center"
                  title="Ordenar por Vencimento"
                >
                  <div className="inline-flex items-center gap-1.5 justify-center">
                    <span className={sortField === 'dueDate' ? 'text-sky-700 font-black' : 'group-hover:text-slate-900'}>
                      Vencimento
                    </span>
                    {sortField === 'dueDate' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-sky-600" /> : <ArrowDown className="w-3.5 h-3.5 text-sky-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-500" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('originalAmount')}
                  className="py-3.5 px-3 select-none cursor-pointer group hover:bg-slate-100 transition-colors text-right"
                  title="Ordenar por Valor Original"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end">
                    <span className={sortField === 'originalAmount' ? 'text-sky-700 font-black' : 'group-hover:text-slate-900'}>
                      Valor Original
                    </span>
                    {sortField === 'originalAmount' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-sky-600" /> : <ArrowDown className="w-3.5 h-3.5 text-sky-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-500" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('paidAmount')}
                  className="py-3.5 px-3 select-none cursor-pointer group hover:bg-slate-100 transition-colors text-right"
                  title="Ordenar por Valor Pago"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end">
                    <span className={sortField === 'paidAmount' ? 'text-sky-700 font-black' : 'group-hover:text-slate-900'}>
                      Valor Pago
                    </span>
                    {sortField === 'paidAmount' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-sky-600" /> : <ArrowDown className="w-3.5 h-3.5 text-sky-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-500" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('remaining')}
                  className="py-3.5 px-3 select-none cursor-pointer group hover:bg-slate-100 transition-colors text-right"
                  title="Ordenar por Saldo"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end">
                    <span className={sortField === 'remaining' ? 'text-sky-700 font-black' : 'group-hover:text-slate-900'}>
                      Saldo
                    </span>
                    {sortField === 'remaining' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-sky-600" /> : <ArrowDown className="w-3.5 h-3.5 text-sky-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-500" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('status')}
                  className="py-3.5 px-3 select-none cursor-pointer group hover:bg-slate-100 transition-colors text-center"
                  title="Ordenar por Status"
                >
                  <div className="inline-flex items-center gap-1.5 justify-center">
                    <span className={sortField === 'status' ? 'text-sky-700 font-black' : 'group-hover:text-slate-900'}>
                      Status
                    </span>
                    {sortField === 'status' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-sky-600" /> : <ArrowDown className="w-3.5 h-3.5 text-sky-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-500" />
                    )}
                  </div>
                </th>

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
              ) : paginatedPayables.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Nenhuma conta a pagar encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                paginatedPayables.map((p) => {
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
                        <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                          <span>{p.description}</span>
                          {p.nfEntryId && (
                            <span className="text-[10px] bg-sky-100 text-sky-800 font-extrabold px-1.5 py-0.2 rounded">
                              NF-e
                            </span>
                          )}
                          {(() => {
                            const bInfo = parsePayableBatchInfo(p.notes);
                            if (!bInfo.isBatch && !p.description.match(/\(\d+\/\d+\)/)) return null;
                            const tagText = bInfo.displayTag || (p.description.match(/\((\d+\/\d+)\)/)?.[1] ? `Parcela ${p.description.match(/\((\d+\/\d+)\)/)![1]}` : 'Série');
                            const isRec = bInfo.batchType === 'recorrente' || tagText.toLowerCase().includes('recorr');
                            return (
                              <span
                                className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200/70 font-bold px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 shadow-2xs"
                                title={isRec ? 'Lançamento recorrente vinculado' : 'Lançamento parcelado vinculado'}
                              >
                                {isRec ? <Repeat className="w-2.5 h-2.5 text-indigo-500" /> : <Layers className="w-2.5 h-2.5 text-indigo-500" />}
                                {tagText}
                              </span>
                            );
                          })()}
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
                          className={`font-bold font-mono text-[11px] ${
                            p.dueDate < todayStr && !isPaid && !isCanceled
                              ? 'text-rose-600'
                              : 'text-slate-700'
                          }`}
                        >
                          {formatDisplayDate(p.dueDate)}
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

        {/* MOBILE CARDS VIEW */}
        <div className="block md:hidden p-3 space-y-3 bg-slate-50/50">
          {isLoading ? (
            <div className="py-8 text-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-600" />
              Carregando contas...
            </div>
          ) : paginatedPayables.length === 0 ? (
            <p className="py-6 text-center text-slate-400 text-xs">
              Nenhuma conta a pagar encontrada.
            </p>
          ) : (
            paginatedPayables.map((p) => {
              const remaining = p.remainingAmount ?? Math.max(0, p.originalAmount - p.paidAmount);
              const isPaid = p.status === 'pago';
              const isCanceled = p.status === 'cancelado';
              const isOverdue = p.dueDate < todayStr && !isPaid && !isCanceled;

              const bInfo = parsePayableBatchInfo(p.notes);
              const tagText = bInfo.isBatch
                ? bInfo.displayTag
                : p.description.match(/\((\d+\/\d+)\)/)?.[1]
                ? `Parcela ${p.description.match(/\((\d+\/\d+)\)/)![1]}`
                : null;

              return (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedPayable(p);
                    setIsDetailsModalOpen(true);
                  }}
                  className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs space-y-3 text-left transition-all active:scale-[0.99] cursor-pointer"
                >
                  {/* Top Bar: Title, Batch tag & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold text-slate-900 text-xs leading-tight">
                          {p.description}
                        </span>
                        {p.nfEntryId && (
                          <span className="text-[9px] bg-sky-100 text-sky-800 font-extrabold px-1.5 py-0.2 rounded">
                            NF-e
                          </span>
                        )}
                        {tagText && (
                          <span className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-200/70 font-bold px-1.5 py-0.2 rounded-md inline-flex items-center gap-1">
                            {bInfo.batchType === 'recorrente' ? <Repeat className="w-2.5 h-2.5 text-indigo-500" /> : <Layers className="w-2.5 h-2.5 text-indigo-500" />}
                            {tagText}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {p.supplierName || 'Fornecedor avulso'} • {p.category}
                      </p>
                    </div>

                    <div className="shrink-0">{getStatusBadge(p.status)}</div>
                  </div>

                  {/* Document & Due Date Bar */}
                  <div className="flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <span className="font-mono text-slate-500">
                      Doc: <strong className="text-slate-700">{p.documentNumber || '—'}</strong>
                    </span>
                    <span className={`font-mono font-bold ${isOverdue ? 'text-rose-600' : 'text-slate-700'}`}>
                      Vence: {formatDisplayDate(p.dueDate)}
                    </span>
                  </div>

                  {/* Financial Values Grid */}
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100 text-left">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">Original</span>
                      <span className="text-xs font-bold text-slate-800">{formatCurrency(p.originalAmount)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">Pago</span>
                      <span className="text-xs font-semibold text-emerald-700">{formatCurrency(p.paidAmount)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">Saldo</span>
                      <span className="text-xs font-black text-rose-600">{formatCurrency(remaining)}</span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div
                    className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!isPaid && !isCanceled && (
                      <button
                        onClick={() => handleOpenPaymentModal(p)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
                      >
                        Dar Baixa
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenEdit(p)}
                      className="p-1.5 text-slate-500 hover:text-sky-600 bg-slate-100 hover:bg-sky-50 rounded-lg text-xs font-bold flex items-center gap-1"
                      title="Editar Conta"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>
                    <button
                      onClick={() => handleOpenDeleteOrCancel(p)}
                      className="p-1.5 text-slate-500 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 rounded-lg text-xs font-bold flex items-center gap-1"
                      title="Excluir ou Cancelar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Pagination Controls */}
      {filteredPayables.length > 0 && (
        <PaginationControls
          currentPage={currentPage}
          totalItems={filteredPayables.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          itemName="contas a pagar"
        />
      )}

      {/* MODAL 2: Registrar Baixa (Pagamento Total ou Parcial) */}
      {isPaymentModalOpen && targetPayable && createPortal(
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
                  <span>Vencimento: <strong className="text-slate-700">{formatDisplayDate(targetPayable.dueDate)}</strong></span>
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
                    inputMode="numeric"
                    required
                    placeholder="R$ 0,00"
                    value={paymentData.amountPaid}
                    onChange={(e) => setPaymentData({ ...paymentData, amountPaid: maskCurrency(e.target.value) })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-black text-emerald-700 focus:ring-2 focus:ring-emerald-500/20 font-mono"
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
                    inputMode="numeric"
                    placeholder="R$ 0,00"
                    value={paymentData.discount}
                    onChange={(e) => setPaymentData({ ...paymentData, discount: maskCurrency(e.target.value) })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 text-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Juros/Multa (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="R$ 0,00"
                    value={paymentData.interest}
                    onChange={(e) => setPaymentData({ ...paymentData, interest: maskCurrency(e.target.value) })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 text-slate-800 font-mono"
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
        </div>,
        document.body
      )}

      {/* MODAL 3: Detalhes da Conta & Histórico de Baixas (com Estorno) */}
      {isDetailsModalOpen && selectedPayable && createPortal(
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
                  <p className="font-bold text-slate-800">{formatDisplayDate(selectedPayable.dueDate)}</p>
                  {selectedPayable.issueDate && (
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      Emissão: {formatDisplayDate(selectedPayable.issueDate)}
                    </span>
                  )}
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

              {/* Informações da Série & Observações */}
              {(() => {
                const bInfo = parsePayableBatchInfo(selectedPayable.notes);
                return (
                  <div className="space-y-3">
                    {bInfo.isBatch && (
                      <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-2xl flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 text-indigo-900 font-bold">
                          {bInfo.batchType === 'recorrente' ? <Repeat className="w-4 h-4 text-indigo-600 shrink-0" /> : <Layers className="w-4 h-4 text-indigo-600 shrink-0" />}
                          <span>Lançamento em Série: {bInfo.displayTag || 'Parcelas Vinculadas'}</span>
                        </div>
                        {bInfo.batchId && (
                          <span className="text-[10px] font-mono text-indigo-600 bg-white/80 px-2 py-0.5 rounded border border-indigo-200">
                            Lote: {bInfo.batchId}
                          </span>
                        )}
                      </div>
                    )}

                    {bInfo.cleanNotes && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Observações</span>
                        <p className="text-slate-700 whitespace-pre-wrap">{bInfo.cleanNotes}</p>
                      </div>
                    )}
                  </div>
                );
              })()}

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
                            <td className="py-2.5 px-3 font-semibold text-slate-800 font-mono text-[11px]">
                              {formatDisplayDate(pmt.paymentDate)}
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
        </div>,
        document.body
      )}

      {/* MODAL 4: In-App Confirmation Modal (Excluir ou Cancelar Conta) */}
      {confirmModal.isOpen && confirmModal.payable && createPortal(
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
                    scope: 'single',
                    seriesCount: 0,
                    pendingInSeries: [],
                    paidInSeriesCount: 0,
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

              {/* Opções de Escopo para Séries em Exclusão / Cancelamento */}
              {confirmModal.seriesCount > 1 && (
                <div className="p-3.5 bg-indigo-50/80 border border-indigo-200/90 rounded-2xl space-y-2.5">
                  <div className="flex items-center gap-2 text-indigo-950 font-bold text-xs">
                    <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Lançamento em Série Vinculado ({confirmModal.seriesCount} contas no lote)</span>
                  </div>
                  <p className="text-[11px] text-indigo-800 leading-relaxed">
                    Esta conta faz parte de um lançamento agrupado. Deseja aplicar a ação apenas nesta parcela ou em toda a série pendente?
                  </p>
                  <div className="space-y-2 text-[11px]">
                    <div
                      onClick={() => setConfirmModal((prev) => ({ ...prev, scope: 'single' }))}
                      className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                        confirmModal.scope === 'single'
                          ? 'bg-white border-rose-600 ring-2 ring-rose-500/20 text-slate-900 font-bold shadow-xs'
                          : 'bg-white/60 border-indigo-200/60 text-slate-700 hover:bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        id="delScopeSingle"
                        name="delScope"
                        checked={confirmModal.scope === 'single'}
                        onChange={() => setConfirmModal((prev) => ({ ...prev, scope: 'single' }))}
                        className="mt-0.5 text-rose-600 focus:ring-rose-500"
                      />
                      <label htmlFor="delScopeSingle" className="cursor-pointer">
                        <span className="block font-bold">
                          {confirmModal.actionType === 'delete' ? 'Excluir apenas esta parcela' : 'Cancelar apenas esta parcela'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-normal">
                          Mantém as outras {confirmModal.seriesCount - 1} contas deste lote salvas e inalteradas.
                        </span>
                      </label>
                    </div>

                    <div
                      onClick={() => setConfirmModal((prev) => ({ ...prev, scope: 'series' }))}
                      className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                        confirmModal.scope === 'series'
                          ? 'bg-white border-rose-600 ring-2 ring-rose-500/20 text-slate-900 font-bold shadow-xs'
                          : 'bg-white/60 border-indigo-200/60 text-slate-700 hover:bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        id="delScopeSeries"
                        name="delScope"
                        checked={confirmModal.scope === 'series'}
                        onChange={() => setConfirmModal((prev) => ({ ...prev, scope: 'series' }))}
                        className="mt-0.5 text-rose-600 focus:ring-rose-500"
                      />
                      <label htmlFor="delScopeSeries" className="cursor-pointer">
                        <span className="block font-bold">
                          {confirmModal.actionType === 'delete'
                            ? `Excluir todas as contas pendentes da série (${confirmModal.pendingInSeries.length} contas)`
                            : `Cancelar todas as contas pendentes da série (${confirmModal.pendingInSeries.length} contas)`}
                        </span>
                        <span className="text-[10px] text-slate-500 font-normal">
                          Remove todas as parcelas ainda não pagas deste lançamento.
                          {confirmModal.paidInSeriesCount > 0 && (
                            <span className="block text-emerald-700 font-bold mt-0.5">
                              • {confirmModal.paidInSeriesCount} parcela(s) já baixada(s)/paga(s) serão protegidas e mantidas intactas.
                            </span>
                          )}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Mensagem explicativa */}
              {confirmModal.actionType === 'delete' ? (
                <div className="p-3 bg-rose-50/70 border border-rose-200/80 rounded-xl text-rose-900 leading-relaxed">
                  <p className="font-bold mb-1">Atenção: Exclusão Permanente</p>
                  <p className="text-[11px] text-rose-800">
                    {confirmModal.scope === 'series'
                      ? `Serão excluídas ${confirmModal.pendingInSeries.length} contas pendentes desta série.`
                      : confirmModal.payable.paidAmount > 0
                      ? 'Esta conta possui baixas parciais ou totais. Ao excluir, a conta e todo o histórico de baixas associadas serão permanentemente removidos do banco de dados.'
                      : 'Esta conta será removida definitivamente do banco de dados.'}
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-amber-900 leading-relaxed">
                  <p className="font-bold mb-1">Cancelar Conta a Pagar</p>
                  <p className="text-[11px] text-amber-800">
                    O status da conta será alterado para <strong>"Cancelado"</strong> sem remover o registro do histórico do sistema.
                  </p>
                </div>
              )}

              {/* Botões de Ação */}
              <div className="pt-2 flex items-center justify-between gap-2.5">
                {confirmModal.actionType === 'delete' && confirmModal.payable.paidAmount > 0 ? (
                  <button
                    type="button"
                    disabled={confirmModal.isExecuting}
                    onClick={() => setConfirmModal((prev) => ({ ...prev, actionType: 'cancel' }))}
                    className="text-[11px] font-bold text-amber-700 hover:text-amber-800 underline underline-offset-2"
                  >
                    Apenas Cancelar Conta
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={confirmModal.isExecuting}
                    onClick={() =>
                      setConfirmModal({
                        isOpen: false,
                        payable: null,
                        actionType: 'delete',
                        scope: 'single',
                        seriesCount: 0,
                        pendingInSeries: [],
                        paidInSeriesCount: 0,
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
                        <span>
                          {confirmModal.scope === 'series' && confirmModal.pendingInSeries.length > 1
                            ? `Excluir Série (${confirmModal.pendingInSeries.length})`
                            : 'Excluir Parcela'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Ban className="w-3.5 h-3.5" />
                        <span>
                          {confirmModal.scope === 'series' && confirmModal.pendingInSeries.length > 1
                            ? `Cancelar Série (${confirmModal.pendingInSeries.length})`
                            : 'Cancelar Parcela'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL 5: In-App Confirmation Modal (Estorno de Baixa) */}
      {voidModal.isOpen && voidModal.payment && createPortal(
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
        </div>,
        document.body
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
