import React, { useState, useEffect, useRef } from 'react';
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
  TrendingUp,
  Percent,
  Upload,
  Trash2,
  Image as ImageIcon,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { DismissibleInfoCard } from './DismissibleInfoCard';

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
  const { companyInfo, updateCompanyInfo } = useStock();

  const [name, setName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('RJ');
  const [defaultMarkupPercent, setDefaultMarkupPercent] = useState<number | string>(85);
  const [logoUrl, setLogoUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Sincroniza campos locais quando os dados reais da empresa carregam do servidor
  useEffect(() => {
    if (companyInfo) {
      setName(companyInfo.name || '');
      setTradeName(companyInfo.tradeName || '');
      setCnpj(companyInfo.cnpj ? formatCnpj(companyInfo.cnpj) : '');
      setAddress(companyInfo.address || '');
      setCity(companyInfo.city || '');
      setState(companyInfo.state || 'RJ');
      setLogoUrl(companyInfo.logoUrl || '');
      setDefaultMarkupPercent(
        companyInfo.defaultMarkupPercent !== undefined && !isNaN(companyInfo.defaultMarkupPercent)
          ? companyInfo.defaultMarkupPercent
          : 85
      );
    }
  }, [companyInfo]);

  const isConfigured = Boolean(
    companyInfo?.isConfigured && companyInfo?.name && companyInfo?.cnpj
  );

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCnpj(e.target.value);
    setCnpj(formatted);
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Por favor selecione um arquivo de imagem válido (PNG, JPG, WEBP, SVG).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('O arquivo de imagem é muito grande. O tamanho máximo permitido é 5MB.');
      return;
    }

    setErrorMsg('');
    const reader = new FileReader();
    reader.onload = (event) => {
      const imgData = event.target?.result as string;
      if (!imgData) return;

      // Se for SVG, salva direto
      if (file.type.includes('svg')) {
        setLogoUrl(imgData);
        return;
      }

      // Redimensionamento otimizado via canvas para garantir máxima nitidez com tamanho reduzido
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 384;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const optimizedDataUrl = canvas.toDataURL('image/png', 0.92);
          setLogoUrl(optimizedDataUrl);
        } else {
          setLogoUrl(imgData);
        }
      };
      img.src = imgData;
    };
    reader.readAsDataURL(file);

    // Reseta o input para permitir selecionar o mesmo arquivo novamente
    e.target.value = '';
  };

  const handleRemoveLogo = () => {
    setLogoUrl('');
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

    const markupNum = parseFloat(String(defaultMarkupPercent));
    if (isNaN(markupNum) || markupNum < 0) {
      setErrorMsg('A Margem de Lucro Padrão deve ser um valor numérico positivo ou zero.');
      return;
    }

    setIsSaving(true);

    try {
      await updateCompanyInfo({
        id: companyInfo?.id || 'default-company',
        name: name.trim(),
        tradeName: tradeName.trim() || name.trim(),
        cnpj: formatCnpj(cleanCnpjDigits),
        address: address.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        defaultMarkupPercent: markupNum,
        logoUrl: logoUrl.trim(),
        isConfigured: true,
      });

      setSuccessMsg('Dados da empresa gravados com sucesso no banco de dados!');
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
              <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase ${
                isConfigured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {isConfigured ? 'Cadastro Configurado' : 'Aguardando Cadastro'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Gerencie a identificação jurídica, CNPJ fiscal e localização desta empresa.
            </p>
          </div>
        </div>
      </div>

      {/* Unconfigured Alert Banner */}
      {!isConfigured && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-2xs animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-950 space-y-1">
            <p className="font-bold text-amber-900">
              Nenhum dado cadastrado ainda — preencha o formulário abaixo
            </p>
            <p className="text-amber-800 leading-relaxed">
              Os dados oficiais e o CNPJ da empresa ainda não foram cadastrados. Preencha e salve o formulário com as informações reais para habilitar a validação e importação de Notas Fiscais Eletrônicas (NF-e).
            </p>
          </div>
        </div>
      )}

      {/* Security & Fiscal Integrity Notice (Dismissible on first access) */}
      <DismissibleInfoCard
        storageKey="dismissed_info_company_fiscal_security"
        className="bg-sky-50/80 border border-sky-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-2xs"
      >
        <div className="flex items-start gap-3.5">
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
      </DismissibleInfoCard>

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
          
          {/* SEÇÃO 1: Logotipo & Identidade Visual */}
          <div className="border-b border-slate-100 pb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-rose-500" />
                Identidade Visual & Logotipo
              </h2>
              {logoUrl ? (
                <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 uppercase tracking-tight">
                  Personalizado
                </span>
              ) : (
                <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase tracking-tight">
                  Padrão do Sistema
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Esta imagem é exibida de forma fixa no topo do menu lateral (sidebar) e nos cabeçalhos operacionais.
            </p>

            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
              {/* Box de Prévia (simulando a área de topo do sidebar escuro) */}
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-700/80 flex items-center justify-center p-2 shadow-inner relative group">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Prévia do Logotipo"
                      className="w-16 h-16 object-contain rounded-xl"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-rose-600 via-pink-500 to-amber-400 p-0.5 flex items-center justify-center shadow-md">
                      <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center font-black text-rose-600 text-xl tracking-tighter">
                        G
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Prévia no Menu
                </span>
              </div>

              {/* Controles de Upload e Remoção */}
              <div className="flex-1 space-y-3 text-center sm:text-left">
                <div>
                  <h4 className="text-xs font-black text-slate-800">
                    {logoUrl ? 'Logotipo Personalizado Selecionado' : 'Logotipo Padrão GummyStock Ativo'}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Envie o arquivo de imagem da sua marca (PNG, JPG, WEBP ou SVG). Dimensão ideal recomendada: quadrada (ex: 256×256 px).
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/png, image/jpeg, image/jpg, image/webp, image/svg+xml"
                    onChange={handleLogoFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{logoUrl ? 'Substituir Imagem...' : 'Enviar Imagem do Computador...'}</span>
                  </button>

                  {logoUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-rose-200 font-bold text-xs transition-all active:scale-95 cursor-pointer"
                      title="Restaurar o logotipo padrão do sistema"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remover / Restaurar Padrão</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

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
                placeholder="Ex: Razão Social da Empresa Ltda"
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
                placeholder="Ex: Nome Fantasia (Opcional)"
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
                placeholder="Ex: Rua, Número, Complemento, Bairro"
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
                placeholder="Ex: Nome da Cidade"
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
                <option value="">Selecione o Estado...</option>
                {BRAZILIAN_STATES.map((st) => (
                  <option key={st.uf} value={st.uf}>
                    {st.uf} - {st.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Precificação & Margem de Lucro Padrão */}
          <div className="pt-6 border-t border-slate-100 space-y-4">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                Precificação & Margem de Lucro Padrão
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Configure a margem de lucro sugerida para novos produtos importados via Nota Fiscal (XML).
              </p>
            </div>

            <div className="max-w-md">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Margem de Lucro Padrão (%) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0"
                  max="10000"
                  value={defaultMarkupPercent}
                  onChange={(e) => setDefaultMarkupPercent(e.target.value)}
                  placeholder="85"
                  required
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50/50"
                />
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400 font-bold text-xs">
                  %
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                Utilizada no cálculo do <strong>Preço de Venda Sugerido</strong> para produtos novos na importação de NF-e: 
                <span className="font-mono text-emerald-700 ml-1">Preço Custo × (1 + {defaultMarkupPercent || 85}%)</span>.
              </p>
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
