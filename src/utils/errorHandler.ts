/**
 * Utilitário central de tratamento de erros e formatação amigável para o usuário.
 * Remove detalhes de infraestrutura (como URLs do Cloud Run, endpoints e stack traces)
 * e fornece mensagens claras, empáticas e funcionais em português.
 */

export function sanitizeErrorText(raw: string): string {
  if (!raw) return '';

  // Remove URLs completas (http, https, run.app, etc)
  let clean = raw.replace(/https?:\/\/[^\s$.?#].[^\s]*/gi, '');

  // Remove caminhos de API e rotas técnicas
  clean = clean.replace(/\/api\/[a-zA-Z0-9_\-\/]+/gi, '');

  // Remove cabeçalhos de erro técnicos comuns
  clean = clean.replace(/^(Error|TypeError|SyntaxError|UnhandledPromiseRejection|AxiosError):\s*/i, '');

  // Remove tags HTML se houver
  clean = clean.replace(/<[^>]*>?/gm, '');

  // Normaliza espaços em branco
  clean = clean.replace(/\s+/g, ' ').trim();

  return clean;
}

export function getFriendlyErrorMessage(error: any, fallbackMessage = 'Não foi possível concluir a operação. Tente novamente em instantes.'): string {
  // Mantém log técnico completo no console do navegador para diagnóstico de desenvolvedor
  if (error) {
    console.error('[GummyStock Diagnóstico Técnico]:', error);
  }

  if (!error) {
    return fallbackMessage;
  }

  // Extrai a mensagem de texto de diversas estruturas possíveis
  let rawMsg = '';
  let status: number | undefined = undefined;

  if (typeof error === 'string') {
    rawMsg = error;
  } else if (error instanceof Error) {
    rawMsg = error.message;
  } else if (typeof error === 'object') {
    status = error.status || error.statusCode || error.response?.status;
    rawMsg = error.error || error.message || error.statusText || error.data?.error || error.data?.message || '';
  }

  const cleanMsg = sanitizeErrorText(rawMsg);
  const lower = (rawMsg + ' ' + cleanMsg).toLowerCase();

  // 1. Falhas de Conexão e Rede
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('err_connection') ||
    lower.includes('err_internet_disconnected') ||
    lower.includes('econnrefused') ||
    lower.includes('timeout') ||
    lower.includes('sem conexao') ||
    lower.includes('sem conexão')
  ) {
    return 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet e tente novamente.';
  }

  // 2. Autenticação e Sessão / Token
  if (
    status === 401 ||
    lower.includes('token ausente') ||
    lower.includes('token inválido') ||
    lower.includes('token invalido') ||
    lower.includes('token expirado') ||
    lower.includes('não autorizado') ||
    lower.includes('nao autorizado') ||
    lower.includes('unauthorized') ||
    lower.includes('id-token-expired') ||
    lower.includes('user-token-expired') ||
    lower.includes('sessão expirada')
  ) {
    return 'Sua sessão expirou ou não foi validada. Por favor, confirme seu login no sistema.';
  }

  // 3. Permissão e Acesso Restrito
  if (
    status === 403 ||
    lower.includes('permissão') ||
    lower.includes('permissao') ||
    lower.includes('acesso negado') ||
    lower.includes('forbidden')
  ) {
    return 'Você não possui permissão para realizar esta operação. Solicite liberação ao administrador.';
  }

  // 4. Erros Internos de Servidor / Banco de Dados
  if (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    lower.includes('internal server error') ||
    lower.includes('database error') ||
    lower.includes('postgres') ||
    lower.includes('supabase') ||
    lower.includes('banco de dados inacessível') ||
    lower.includes('banco de dados inacessivel')
  ) {
    return 'Ocorreu uma instabilidade temporária no servidor. Nossos serviços estão recuperando e você pode tentar novamente em alguns instantes.';
  }

  // 5. Conflito / Duplicidade
  if (status === 409 || lower.includes('já cadastrado') || lower.includes('ja cadastrado') || lower.includes('duplicat')) {
    return 'Já existe um registro cadastrado com essas informações no sistema.';
  }

  // 6. Se já for uma mensagem de validação de negócio clara e sem lixo técnico
  if (cleanMsg && cleanMsg.length > 3 && !cleanMsg.includes('Cloud Run') && !cleanMsg.includes('http')) {
    return cleanMsg;
  }

  return fallbackMessage;
}
