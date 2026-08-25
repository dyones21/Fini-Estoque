import React, { useState, useEffect } from 'react';
import {
  Building2,
  Save,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  ShieldCheck,
  MapPin,
  FileText,
  Loader2,
} from 'lucide-react';
import { useStock } from '../context/StockContext';

const BRAZILIAN_STATES = [
  { uf: 'AC', name: 'Acre' },
  { uf: 'AL', name: 'Alagoas' },
  { uf: 'AP', name: 'Amapá' },
  { uf: 'AM', name: 'Amazonas' },
  { uf: 'BA', name: 'Bahia' },
  { uf: 'CE', name: 'Ceará' },
  { uf: 'DF', name: 'Distrito Federal' },
  { uf: 'ES', name: 'Espírito Santo' },
  { uf: 'GO', name: 'Goiás' },
  { uf: 'MA', name: 'Maranhão' },
  { uf: 'MT', name: 'Mato Grosso' },
  { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'MG', name: 'Minas Gerais' },
  { uf: 'PA', name: 'Pará' },
  { uf: 'PB', name: 'Paraíba' },
  { uf: 'PR', name: 'Paraná' },
  { uf: 'PE', name: 'Pernambuco' },
  { uf: 'PI', name: 'Piauí' },
  { uf: 'RJ', name: 'Rio de Janeiro' },
  { uf: 'RN', name: 'Rio Grande do Norte' },
  { uf: 'RS', name: 'Rio Grande do Sul' },
  { uf: 'RO', name: 'Rondônia' },
  { uf: 'RR', name: 'Roraima' },
  { uf: 'SC', name: 'Santa Catarina' },
  { uf: 'SP', name: 'São Paulo' },
  { uf: 'SE', name: 'Sergipe' },
  { uf: 'TO', name: 'Tocantins' },
];

function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

function isValidCnpj(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  // Validação dos dígitos verificadores padrão da Receita Federal
  let size = digits.length - 2;
  let numbers = digits.substring(0, size);
  const sumDigits = digits.substring(size);
  let sum = 0;
  let pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += Number(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== Number(sumDigits.charAt(0))) return false;

  size = size + 1;
  numbers = digits.substring(0, size);
  sum = 0;
  pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += Number(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== Number(sumDigits.charAt(1))) return false;

  return true;
}

export const CompanyDataView: React.FC = () => {
  const { currentTenant, updateCompanyInfo } = useStock();

  const [name, setName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('RJ');

  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Sincroniza campos locais quando os dados da empresa no contexto carregam/mudam
  useEffect(() => {
    if (currentTenant) {
      setName(currentTenant.name || '');
      setTradeName(currentTenant.tradeName || 'Fini Nova Friburgo');
      setCnpj(formatCnpj(currentTenant.cnpj || '02.408.821/0001-44'));
      setAddress(currentTenant.address || 'Rua Alberto Braune, 120 - Centro');
      setCity(currentTenant.city || 'Nova Friburgo');
      setState(currentTenant.state || 'RJ');
    }
  }, [currentTenant]);

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCnpj(e.target.value);
    setCnpj(formatted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!name.trim()) {
      setErrorMsg('A Razão Social é obrigatória.');
      return;
    }

    const cleanCnpjDigits = cnpj.replace(/\D/g, '');
    if (cleanCnpjDigits.length !== 14) {
      setErrorMsg('O CNPJ deve conter exatamente 14 dígitos numéricos.');
      return;
    }

    if (!isValidCnpj(cleanCnpjDigits)) {
      setErrorMsg('CNPJ inválido de acordo com o algoritmo oficial da Receita Federal.');
      return;
    }

    if (!city.trim()) {
      setErrorMsg('O campo Cidade é obrigatório.');
      return;
    }

    setIsSaving(true);

    try {
      await updateCompanyInfo({
        id: currentTenant?.id || 'default-company',
        name: name.trim(),
        tradeName: tradeName.trim() || name.trim(),
        cnpj: formatCnpj(cleanCnpjDigits),
        address: address.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
      });

      setSuccessMsg('Dados da empresa atualizados com sucesso no banco de dados!');
      setTimeout(() => {
        setSuccessMsg('');
      }, 4000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Falha ao salvar dados da empresa no servidor.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-rose-50 text-rose-600 shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900">Dados da Empresa</h1>
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 uppercase">
                Cadastro Oficial
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Gerencie a identificação jurídica, CNPJ fiscal e localização desta empresa.
            </p>
          </div>
        </div>
      </div>

      {/* Security & Fiscal Integrity Notice */}
      <div className="bg-sky-50/80 border border-sky-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-2xs">
        <ShieldCheck className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
        <div className="text-xs text-sky-950 space-y-1">
          <p className="font-bold text-sky-900">
            Validação Fiscal de NF-e Integrada
          </p>
          <p className="text-sky-800 leading-relaxed">
            O CNPJ cadastrado nesta tela é utilizado como chave de segurança oficial na importação de arquivos XML de Notas Fiscais Eletrônicas. 
            O servidor só autoriza entradas de NF-e emitidas para o mesmo CNPJ registrado aqui.
          </p>
        </div>
      </div>

      {/* Feedback Messages */}
      {successMsg && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl text-xs font-semibold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2.5 bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl text-xs font-semibold animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-6 sm:p-8 space-y-6">
          
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-rose-500" />
              Identificação Jurídica & Fiscal
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Informe os dados exatamente como constam no Cartão CNPJ da Receita Federal.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Razão Social */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Razão Social <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Doceria Nova Friburgo Ltda"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 bg-slate-50/50"
              />
            </div>

            {/* Nome Fantasia */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Nome Fantasia
              </label>
              <input
                type="text"
                value={tradeName}
                onChange={(e) => setTradeName(e.target.value)}
                placeholder="Ex: Fini Nova Friburgo (Matriz)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 bg-slate-50/50"
              />
            </div>

            {/* CNPJ */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                CNPJ <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={cnpj}
                onChange={handleCnpjChange}
                placeholder="00.000.000/0000-00"
                maxLength={18}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 bg-slate-50/50"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Formato com pontuação automática (14 dígitos numéricos)
              </span>
            </div>

            {/* Endereço */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Endereço Completo
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ex: Rua Alberto Braune, 120 - Centro"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 bg-slate-50/50"
              />
            </div>

            {/* Cidade */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Cidade <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ex: Nova Friburgo"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 bg-slate-50/50"
              />
            </div>

            {/* Estado */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Estado (UF) <span className="text-rose-500">*</span>
              </label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 bg-slate-50/50"
              >
                {BRAZILIAN_STATES.map((st) => (
                  <option key={st.uf} value={st.uf}>
                    {st.uf} - {st.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 px-6 sm:px-8 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>As alterações são salvas diretamente no banco de dados e entram em vigor imediatamente.</span>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-md shadow-rose-900/20 transition-all cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Salvar Dados da Empresa</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
