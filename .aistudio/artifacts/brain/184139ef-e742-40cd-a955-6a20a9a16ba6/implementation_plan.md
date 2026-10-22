# Rastreamento de Lançamentos em Contas a Pagar & Prevenção de Duplicidade na NF-e

## Resumo Executivo
Este plano estabelece a implementação de duas melhorias críticas:
1. **Rastreamento de Lançamentos Vinculados no Contas a Pagar:** Identificação determinística de séries parceladas e recorrentes geradas no mesmo lançamento (usando metadado estruturado no campo `notes` sem necessidade de alterar o schema do banco de dados), permitindo que o usuário escolha entre excluir/editar apenas a parcela atual ou a série/parcelas futuras pendentes, preservando rigorosamente parcelas já baixadas/pagas.
2. **Prevenção de Duplicidade de Novos Produtos no Lançamento de NF-e:** Correção no fluxo de importação e persistência de itens do XML, garantindo que produtos com mesmo código de barras EAN/GTIN ou nome idêntico não sejam duplicados no estoque nem entre linhas da mesma nota fiscal, nem com produtos já cadastrados.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Decisões Confirmadas com o Usuário:**
> - **Proteção de Parcelas Pagas:** Ao excluir a série ou editar parcelas futuras vinculadas, as parcelas que já receberam baixa (total ou parcial) serão preservadas de forma segura, alterando ou removendo apenas as parcelas em aberto/pendentes.
> - **Identificação de Duplicidade na NF-e:** A verificação de produto existente para evitar duplicidade será feita com base no código de barras EAN/GTIN válido e por nome idêntico (normalizado/sem distinção de maiúsculas e minúsculas).
> - **Zero Alteração no Banco de Dados:** Nenhuma migração ou alteração de colunas no PostgreSQL será feita. A amarração de lote das contas a pagar utilizará metatags transparentes no campo `notes` (ex: `[lote:grp_...] [parc:1/3]`).

---

## 1. Overview & Core Concept

### Contas a Pagar: Rastreamento e Gestão de Séries
- Quando o usuário lança uma conta parcelada ou recorrente, todas as parcelas recebem um identificador de lote exclusivo (`batchId`).
- **Ao Excluir:**
  - Se a conta for avulsa: confirmação padrão de exclusão.
  - Se a conta fizer parte de uma série: o modal oferece duas opções claras:
    - *Opção 1:* **Excluir apenas esta parcela** (mantém as outras do lote intactas).
    - *Opção 2:* **Excluir todas as parcelas pendentes da série** (remove todas as contas em aberto do mesmo lote, mantendo intactas as parcelas que já tiverem pagamento registrado).
- **Ao Editar:**
  - Se a conta fizer parte de uma série: o usuário pode escolher:
    - *Opção 1:* **Alterar apenas esta parcela**.
    - *Opção 2:* **Alterar esta e todas as parcelas futuras** (atualiza dados como descrição, categoria, fornecedor e observações nesta parcela e em todas as parcelas posteriores da mesma série que estiverem pendentes).

### Nota Fiscal (NF-e): Bloqueio de Duplicidade de Novos Produtos
- **Problema diagnosticado:** Na rotina de importação do XML (`handleSubmitXmlNF`), ao encontrar itens marcados como novo produto (`linkType === 'new'`), o sistema gerava IDs aleatórios e inseria sem verificar se:
  1. O mesmo produto (mesmo EAN ou mesmo nome) aparecia em mais de uma linha da mesma NF (ex: lotes diferentes ou desdobramentos de tributação).
  2. O produto já existia previamente no cadastro geral com o mesmo EAN ou nome idêntico.
- **Solução:** Implementação de cache de criação de lote na importação e validação de duplicidade por EAN e nome antes da inserção, vinculando automaticamente ao produto já cadastrado/criado.

---

## 2. Experiência do Usuário & Fluxos de Interação

### Fluxo 1: Exclusão Seletiva de Parcela ou Série
```
[ Clicar em Excluir na Tabela ]
             │
      Faz parte de série?
      ├── Não ──> [ Modal Padrão: Confirmar exclusão da conta ]
      └── Sim ──> [ Modal Especial de Série ]
                       ├── Botão: "Excluir apenas esta parcela"
                       └── Botão: "Excluir todas as parcelas pendentes da série"
```

### Fluxo 2: Edição Seletiva de Parcela ou Parcelas Futuras
```
[ Clicar em Editar na Tabela ]
             │
      Faz parte de série?
      ├── Não ──> [ Salva apenas a conta selecionada ]
      └── Sim ──> [ Modal de Confirmação de Escopo de Edição ]
                       ├── Opção: "Aplicar apenas nesta parcela"
                       └── Opção: "Aplicar nesta e em todas as parcelas futuras pendentes"
```

### Fluxo 3: Importação de NF-e sem Duplicações
```
[ Upload do XML de NF-e ]
             │
    [ Parser & Mapeamento ]
    - Verifica vínculo de fornecedor salvo
    - Verifica código EAN / GTIN
    - Verifica nome aproximado
             │
    [ Gravação da NF ]
    - Detecta EAN / Nome já existente no cadastro
    - Detecta itens repetidos dentro da própria NF
    - Reutiliza o mesmo ID de produto sem gerar cadastros duplicados
```

---

## 3. Arquitetura Técnica & Estratégia de Dados

### Diagrama de Componentes e Fluxo
```
┌────────────────────────────────────────────────────────┐
│                   Frontend (React)                     │
│                                                        │
│  ┌───────────────────────┐    ┌─────────────────────┐  │
│  │   PayablesView.tsx    │    │  NFEntryModal.tsx   │  │
│  │  - batchId extractor  │    │  - duplicate check  │  │
│  │  - series modal (del) │    │  - batch item cache │  │
│  │  - series modal (edit)│    │  - reuse prod ID    │  │
│  └───────────┬───────────┘    └──────────┬──────────┘  │
└──────────────┼───────────────────────────┼─────────────┘
               │                           │
               ▼                           ▼
┌────────────────────────────────────────────────────────┐
│                 Backend API (server.ts)                │
│                                                        │
│  POST /api/payables (gera batchId nas parcelas)        │
│  PUT /api/payables/:id                                 │
│  DELETE /api/payables/:id                              │
│  POST /api/payables/batch-delete (ou loop seguro)      │
│  POST /api/payables/batch-update (ou loop seguro)      │
│  POST /api/products (com idempotência por EAN/Nome)    │
└────────────────────────────────────────────────────────┘
```

### Metadados de Rastreamento (Zero Alteração no BD)
No lançamento parcelado ou recorrente, a propriedade `notes` armazenará a tag identificadora:
```text
[lote:grp_1730000000_abc] [parc:2/5] [Intervalo: Mensal]
```
- Helper `extractBatchInfo(notes)`:
  - `isBatch`: boolean
  - `batchId`: string | null
  - `currentSeq`: number | null
  - `totalSeq`: number | null
  - `cleanNotes`: notas originais do usuário para exibição limpa sem poluição visual.

### Regras de Negócio e Integridade
1. **Preservação de Pagamentos:** Contas com `status === 'pago'` ou `status === 'pago_parcial'` **nunca** são excluídas ou alteradas em operações em lote. Apenas contas `aberto` ou `vencido` são afetadas.
2. **Atualização em Cadeia:** Ao escolher "esta e todas as parcelas futuras":
   - Atualiza `description`, `category`, `supplierId`, mantendo as datas de vencimento individuais e numeração de cada parcela.
3. **NF-e Idempotente:**
   - Durante a iteração dos itens no salvamento da NF: se o item já foi cadastrado na iteração anterior ou já existe no banco com o mesmo EAN ou nome idêntico, seu `id` é aproveitado para a movimentação e vínculo fiscal sem criar novo produto.

---

## 4. Plano de Verificação

1. **Testes de Contas a Pagar:**
   - Lançar uma despesa parcelada em 3x (R$ 300,00 -> 3x R$ 100,00).
   - Verificar na listagem as tags e informações de cada parcela.
   - Pagar a parcela 1/3 (baixa realizada).
   - Testar a exclusão da parcela 2/3 com opção "Excluir todas as parcelas da série":
     - Parcela 1/3 deve permanecer intacta com status pago.
     - Parcelas 2/3 e 3/3 devem ser removidas com sucesso.
   - Testar nova série com 3 parcelas: editar parcela 1/3 escolhendo "esta e todas as futuras":
     - Verificar atualização da descrição e categoria mantendo vencimentos corretos.
2. **Testes de Importação de NF-e:**
   - Simular/verificar salvamento de NF com item que possui EAN de produto já cadastrado.
   - Garantir que não seja duplicado na lista de produtos.
   - Compilação e checagem de linter via `compile_applet` e `lint_applet`.
