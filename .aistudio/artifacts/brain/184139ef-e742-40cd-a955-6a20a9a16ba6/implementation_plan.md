# Plano de Implementação: Logo Fixa no Topo do Sidebar, Barra Superior Adaptável e Substituição de Logo

Implementação concluída com sucesso: o logotipo agora fica perfeitamente posicionado e fixo no topo do menu lateral (sidebar estendido de ponta a ponta da tela), a barra superior (header) molda-se dinamicamente à largura do menu lateral acompanhando suas transições, e a tela de Dados da Empresa inclui módulo completo para substituição, pré-visualização e remoção do logotipo.

---

## 1. Decisões Confirmadas com o Usuário

- **Exibição da Logo no Menu**: Apenas o ícone da logo centralizado em ambos os modos (expandido e minimizado).
- **Substituição de Logo em Dados da Empresa**: Upload direto do computador com pré-visualização em tempo real e botão para remover/restaurar o logotipo padrão.
- **Moldura do Topo**: O sidebar ocupa a altura total da tela (`top-0 bottom-0`), com o bloco da logo no topo (64px, mesma altura do cabeçalho). O cabeçalho superior adapta-se dinamicamente à largura do sidebar (`lg:ml-[220px]` expandido e `lg:ml-16` minimizado), sem sobreposição nem repetições.

---

## 2. Layout Implementado

```
LAYOUT INTEGRADO COM LOGO FIXA E HEADER MOLDADO:
┌───────────────┬────────────────────────────────────────────────────────┐
│ [LOGO ICON]   │ CABEÇALHO SUPERIOR (MOLDADO DINAMICAMENTE)             │
│ (Centralizado │ [Identificação Empresa]    [Loja/Depósito] [Notificações]│
│  no topo-0)   │                                                        │
├───────────────┼────────────────────────────────────────────────────────┤
│ SIDEBAR       │ CONTEÚDO PRINCIPAL (MOLDA-SE E ROLA LIVREMENTE)        │
│ [Minimizar]   │                                                        │
│ [Dashboard]   │  • KPIs / Indicadores                                  │
│ ▾ Estoque     │  • Tabelas e Formulários                               │
│ ▸ Financeiro  │                                                        │
│ ▸ Relatórios  │                                                        │
│ ▸ Config      │                                                        │
│ [PIN / User]  │                                                        │
└───────────────┴────────────────────────────────────────────────────────┘
```

---

## 3. Alterações Realizadas

### A. Tipos de Dados (`src/types.ts`)
- Adicionada a propriedade opcional `logoUrl?: string` na interface `CompanyInfo`.

### B. Banco de Dados e Backend (`src/db/schema.ts`, `src/db/dbService.ts`)
- Incluída a coluna `logo_url` na tabela `company_info`.
- `ensureDbSchema`: Adicionado `ALTER TABLE company_info ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '';`.
- `getCompanyInfo` e `saveCompanyInfo`: Mapeamento e persistência completa de `logoUrl`.

### C. Gestão de Estado e Caching Imediato (`src/context/StockContext.tsx`)
- Inicialização de `companyInfo` com leitura de cache em `localStorage` para exibição instantânea sem flashes no carregamento.
- Atualização otimista em `updateCompanyInfo` para refletir imediatamente a nova imagem na interface assim que selecionada/salva.

### D. Sidebar com Logo Centralizada no Topo (`src/components/Sidebar.tsx`)
- Fixação em `fixed top-0 left-0 bottom-0 z-40`.
- Bloco superior de 64px (`h-16`) com o ícone da logo perfeitamente centralizado em ambos os modos (expandido e minimizado). Exibe a imagem personalizada (`logoUrl`) ou o monograma padrão gradiente "G".
- Barra de controle de navegação e botão minimizar/expandir posicionados de forma discreta logo abaixo.
- Suporte à exibição da logo personalizada também no drawer mobile.

### E. Barra Superior Adaptável (`src/components/Header.tsx` & `src/App.tsx`)
- `<header>` moldado com `transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-[220px]'}`.
- No desktop, eliminada a duplicidade do ícone de logotipo, mantendo a identificação jurídica e os controles operacionais moldados ao lado do menu.
- No mobile, preservado o botão do menu e a logo compacta.

### F. Substituição de Logo em Dados da Empresa (`src/components/CompanyDataView.tsx`)
- Inserido o card **"Identidade Visual & Logotipo"**:
  - Prévia em tempo real com moldura fiel ao visual do sidebar.
  - Upload direto de imagem (`PNG`, `JPG`, `WEBP`, `SVG`) com otimização automática de dimensões via Canvas.
  - Botão **"Remover / Restaurar Padrão"** que volta para o logotipo padrão do GummyStock.
  - Integração com o salvamento unificado de Dados da Empresa.

---

## 4. Status de Verificação

- [x] TypeScript sem erros (`tsc --noEmit`).
- [x] Compilação do Vite (`npm run build`) validada com sucesso.
- [x] Transições e sincronizações validadas.
