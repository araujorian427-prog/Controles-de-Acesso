# Controle de Acessos — Widget Kommo CRM

Este projeto é um **widget personalizado** desenvolvido para o **Kommo CRM**, com o objetivo de **gerenciar permissões de acesso por usuário e tela**, controlando quais usuários podem visualizar ou editar determinadas partes do sistema.

---

## 🎯 Objetivo

O widget “Controle de Acessos” permite definir **quem tem acesso a quais telas** dentro do Kommo CRM. Ele foi desenvolvido para aumentar a segurança e o controle de informações dentro de contas Kommo com múltiplos usuários.

---

## 🧱 Estrutura do Projeto

```
Controle de acessos/
├── manifest.json           # Metadados do widget (nome, descrição, ícone, permissões, etc.)
├── script.js               # Lógica principal do widget (carregamento, exibição, controle de eventos)
├── styles.css              # Estilos visuais da interface do widget
├── html/
│   └── index.html          # Estrutura visual do painel de controle
├── lib/
│   └── helpers.js          # Funções auxiliares (requisições, validações, manipulação de dados)
└── assets/
    ├── icon.svg            # Ícone do widget
    └── logo.png            # Logo da empresa (opcional)
```

> A estrutura pode variar conforme a versão. Alguns arquivos podem estar agrupados ou minificados (por exemplo, `widget.js` único contendo todas as funções).

---

## ⚙️ Funcionamento Geral

### 🔹 1. Carregamento e Inicialização
Ao abrir o Kommo CRM, o widget é carregado no painel **"Configurações Avançadas"**.  
O script principal (`script.js`) realiza a inicialização chamando:
```js
define(['jquery'], function ($) {
  var CustomWidget = function () { ... };
  return CustomWidget;
});
```

Ele injeta o painel HTML (tabela de usuários, botões e toggles) dentro da área designada no CRM.

---

### 🔹 2. Listagem de Usuários
O widget faz uma requisição à API do Kommo:
```
GET /api/v4/users?limit=250
```
Esses dados são utilizados para **preencher o campo de seleção de usuários**, permitindo escolher a pessoa que terá permissões ajustadas.

---

### 🔹 3. Modos de Autenticação
Cada linha da tabela representa um usuário com suas credenciais. Existem **dois tipos de autenticação** possíveis:

- **Kommo** → usa o login interno do CRM; o e-mail e o nome são obtidos automaticamente da API.  
- **Email** → o usuário é cadastrado manualmente com e-mail e senha (armazenados com hash no banco).

O tipo é controlado por um **toggle (pill)** de modo.

---

### 🔹 4. Atribuição de Telas
Ao clicar em “Configurar Telas”, abre-se um painel/modal com todas as telas disponíveis do CRM.  
O usuário seleciona as que devem ser liberadas.  
Ao confirmar, o widget envia a requisição:
```
POST /bloqueio-informacao/cadastrar-acesso
```
com o corpo:
```json
{
  "fields": {
    "user_email": "usuario@dominio.com",
    "domain": "exemplo.kommo.com",
    "telas": ["Leads", "Contatos", "Financeiro"]
  }
}
```

---

### 🔹 5. Controle de Edição e Bloqueio
O widget evita alterações simultâneas e garante consistência dos dados:

- Apenas **uma linha** pode estar em modo de edição por vez.
- O botão “+” para adicionar novo usuário fica desabilitado enquanto houver linha em edição.
- Linhas salvas ficam bloqueadas (inputs desativados).
- Ação “Cancelar edição” restaura o estado original da linha.

---

### 🔹 6. Persistência de Dados
Todas as operações são enviadas para rotas do backend:
```
POST /bloqueio-informacao/cadastrar-usuario
POST /bloqueio-informacao/alterar-usuario
POST /bloqueio-informacao/deletar-usuario
GET  /bloqueio-informacao/listar-acessos/:domain
```
Essas rotas interagem com o banco **PostgreSQL** no backend, utilizando as tabelas:
```
widget.usuario
widget.acesso
```

Campos principais:
- **usr_email** → e-mail do usuário (chave única)
- **usr_domain** → domínio Kommo
- **usr_auth_type** → tipo de autenticação (“kommo” ou “email”)
- **usr_kommo_id** → id de usuário interno (quando Kommo)
- **telas[]** → lista de telas liberadas

---

## 🧠 Lógica Interna

- **_createRow()** → cria uma nova linha na tabela de usuários (modo edição)
- **mount()** → inicializa o widget e carrega os dados existentes
- **handleSave()** → coleta dados, valida e envia para API backend
- **handleEdit() / handleCancel()** → alternam entre modos de edição e visualização
- **refreshSelectKommoUsers()** → atualiza lista de usuários do Kommo disponíveis
- **lockUI() / unlockUI()** → evita conflitos durante operações

---

## 🧰 Tecnologias Utilizadas

- **JavaScript (ES6)**  
- **RequireJS (define/require pattern)**  
- **jQuery**  
- **Kommo API v4**  
- **PostgreSQL (backend)**  
- **HTML + CSS (UI)**  

---

## 🚀 Instalação e Uso

1. Compacte todos os arquivos em `.zip`  
2. No painel do **Kommo**, acesse **Configurações → Integrações → Widgets Personalizados**  
3. Faça o upload do arquivo `.zip`  
4. Após instalado, o widget aparecerá nas **Configurações Avançadas**  
5. Configure as permissões conforme necessidade

---

## 🧩 Requisitos do Backend

Para funcionamento completo, o backend precisa expor as rotas listadas acima, preferencialmente em **Node.js (Express)** ou **Python (FastAPI/Flask)**, conectando-se a um **PostgreSQL** com as seguintes tabelas:

```sql
CREATE TABLE widget.usuario (
  usr_email TEXT PRIMARY KEY,
  usr_auth_type TEXT NOT NULL,
  usr_name TEXT,
  usr_password TEXT,
  usr_domain TEXT,
  usr_kommo_id BIGINT
);

CREATE TABLE widget.acesso (
  user_email TEXT REFERENCES widget.usuario(usr_email),
  domain TEXT,
  telas TEXT[]
);
```

---

## 🔒 Segurança

- **Senhas**: nunca armazenar texto puro; use hash (bcrypt ou Argon2).
- **Validação**: verifique sempre se o domínio (`domain`) pertence ao usuário autenticado.
- **Logs**: registre operações CRUD com timestamp e usuário responsável.
- **Acesso restrito**: apenas administradores devem poder editar permissões.

---

## 🧭 Fluxo de Uso Resumido

1. Administrador abre o widget em **Configurações Avançadas**.  
2. Adiciona usuários (Kommo ou externos).  
3. Configura telas permitidas.  
4. Salva → dados são enviados ao backend → armazenados no banco.  
5. Ao reabrir o Kommo, o widget recupera os acessos e aplica os bloqueios.

---

## 💬 Observações

- O widget foi pensado para uso **corporativo**, com possibilidade de expansão para múltiplos domínios.  
- É compatível com **Kommo Pipeline UI (v2)** e **Locate Everywhere**.  
- Cada linha da interface representa uma combinação de usuário + domínio + permissões.

---

## 🧾 Licença

Projeto de uso interno — direitos reservados à **Evo Result** e seus colaboradores.

---

## 📩 Dúvidas e suporte

Para suporte técnico, entre em contato com o desenvolvedor responsável pelo projeto dentro da Evo Result.
