<div align="center">

![CTRLClima — Clima, Saúde e Terra](assets/ctrlclima-banner.svg)

**API REST · NestJS + TypeScript**

[![Backend](https://img.shields.io/badge/Backend-NestJS-2fc7af?style=for-the-badge&labelColor=0b1a28)](https://crtlclima-b.onrender.com/api/docs)
![NASA](https://img.shields.io/badge/Fontes-Giovanni%20%2B%20AppEEARS-153749?style=for-the-badge&labelColor=0b1a28)
![Documentação](https://img.shields.io/badge/API-Swagger%20%2F%20OpenAPI-153749?style=for-the-badge&labelColor=0b1a28)

[**Explorar Swagger**](https://crtlclima-b.onrender.com/api/docs) · [**Abrir plataforma**](https://crtlclima-f.onrender.com) · [**Frontend no GitHub**](https://github.com/leticiaprofissionaladm-debug/CrtlClima-F)

</div>

---

API REST do **CTRLClima**, construída com NestJS e TypeScript para disponibilizar localidades, registrar a origem das informações científicas e fornecer endpoints de integração com os serviços **NASA Giovanni** e **NASA AppEEARS**.

O projeto **não utiliza Prisma nem banco de dados** na arquitetura atual.

## Links

- **API publicada:** https://crtlclima-b.onrender.com
- **Swagger:** https://crtlclima-b.onrender.com/api/docs
- **Frontend:** https://crtlclima-f.onrender.com
- **Repositório frontend:** https://github.com/leticiaprofissionaladm-debug/CrtlClima-F

## Tecnologias

- Node.js e TypeScript
- NestJS 12 (ES Modules)
- Axios e `@nestjs/axios`
- `@nestjs/config`
- `class-validator` / `class-transformer`
- Swagger / OpenAPI
- Vitest, Prettier e Oxlint

## Pré-requisitos

- Node.js **22.22.3 ou superior** (conforme `package.json`)
- npm
- Acesso à internet para consultas a serviços externos
- Credenciais NASA Earthdata **quando exigidas** pelo fluxo utilizado

## Comece aqui — do zero no Windows

1. Instale o [Git](https://git-scm.com/downloads/win) e o [Node.js](https://nodejs.org/) compatível com o requisito abaixo.
2. Abra o **CMD** ou o terminal do **VS Code** e execute:

   ```cmd
   git clone https://github.com/leticiaprofissionaladm-debug/CrtlClima-B.git
   cd CrtlClima-B
   npm install
   ```

3. Crie um arquivo `.env` na pasta principal com os valores mínimos:

   ```env
   PORT=3000
   CORS_ORIGINS=http://localhost:5173,http://localhost:5174
   ```

4. Execute `npm run start:dev`.
5. Abra `http://localhost:3000/api/docs` para testar a API e acesse `http://localhost:3000/api/locations/countries` para verificar as localidades.
6. Para executar também o frontend local, siga o [README do frontend](https://github.com/leticiaprofissionaladm-debug/CrtlClima-F) em **outro terminal**.

> Consultas autenticadas à NASA podem exigir credenciais adicionais em variáveis de ambiente; não publique tokens no GitHub.

## Instalação local (referência rápida)

```bash
git clone https://github.com/leticiaprofissionaladm-debug/CrtlClima-B.git
cd CrtlClima-B
npm install
```

Crie o arquivo `.env` na raiz do backend e ajuste os valores necessários à sua instalação:

```env
PORT=3000
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
```

Para credenciais e parâmetros específicos da NASA, consulte o arquivo `.env.example` do seu ambiente de desenvolvimento e os nomes lidos pelos serviços Giovanni/AppEEARS. **Não publique credenciais no GitHub.**

Inicie o servidor:

```bash
npm run start:dev
```

A documentação Swagger fica em `http://localhost:3000/api/docs`.

## Scripts

| Comando | Descrição |
| --- | --- |
| `npm run start:dev` | Inicia NestJS em modo de desenvolvimento |
| `npm run build` | Compila a aplicação |
| `npm run start:prod` | Inicia o código compilado em `dist/main` |
| `npm run lint` | Executa análise estática com Oxlint |
| `npm run test` | Executa testes Vitest |
| `npm run test:e2e` | Executa testes end-to-end |
| `npm run format` | Formata arquivos TypeScript com Prettier |

## Endpoints documentados

Prefixo global: `/api`.

### Localidades

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/locations/countries` | Lista países |
| GET | `/api/locations/states?countryCode=BR` | Lista estados do país |
| GET | `/api/locations/cities?countryCode=BR&state=...&search=...` | Pesquisa cidades |

### NASA Giovanni

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/giovanni/variables` | Lista variáveis disponíveis para consulta |
| GET | `/api/giovanni/timeseries?data=...&latitude=...&longitude=...&start=YYYY-MM-DD&end=YYYY-MM-DD` | Consulta série temporal para variável, coordenadas e intervalo |

### NASA AppEEARS

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/appeears/status` | Consulta status da integração |
| GET | `/api/appeears/products` | Consulta produtos |
| POST | `/api/appeears/tasks` | Envia tarefa de extração |
| GET | `/api/appeears/tasks/:id` | Consulta uma tarefa |
| GET | `/api/appeears/tasks/:id/bundle` | Consulta os arquivos gerados |
| GET | `/api/appeears/tasks/:id/bundle/:fileId` | Faz download de arquivo |

### Fontes

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/sources` | Lista informações sobre fontes de dados |

**Observação:** as rotas estão documentadas no repositório, mas a disponibilidade de cada resposta externa depende da autenticação Earthdata, das permissões e dos serviços NASA. A existência do endpoint não equivale à validação de todos os conjuntos de dados.

## Deploy no Render

Crie um **Web Service** conectado ao repositório `CrtlClima-B`:

| Configuração | Valor |
| --- | --- |
| Branch | `main` |
| Runtime | Node |
| Root Directory | vazio (raiz do repositório) |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run start:prod` |
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | `https://crtlclima-f.onrender.com` |

O servidor deve escutar `process.env.PORT` (com fallback local, por exemplo `3000`) e vincular-se a `0.0.0.0`.

Em produção, configure apenas no painel do Render as credenciais exigidas pelos serviços externos. Não inclua segredos no repositório ou no frontend.

## Testes rápidos

Depois de iniciar o backend:

```text
http://localhost:3000/api/docs
http://localhost:3000/api/locations/countries
http://localhost:3000/api/sources
http://localhost:3000/api/giovanni/variables
```

Em produção:

```text
https://crtlclima-b.onrender.com/api/docs
https://crtlclima-b.onrender.com/api/locations/countries
```

## Diagnóstico de erros

- **CORS:** confira `CORS_ORIGINS` e a URL real do frontend; reinicie/republique o backend após mudanças.
- **Erro 401/403 NASA:** confira token, autenticação Earthdata e autorizações necessárias.
- **Erro 500:** examine os logs do serviço no Render e o retorno da API externa.
- **Falha de build:** confirme a versão do Node e execute `npm run build` localmente.

## Limitações científicas

O CTRLClima oferece ferramentas de investigação e visualização. Não realiza diagnóstico médico, não emite previsões meteorológicas oficiais da NASA e não permite atribuir um evento isolado ao El Niño apenas a partir de variações locais de temperatura. Dados e resultados devem manter metadados, unidades, fonte, intervalo temporal e limitações.

## Equipe

**VulcanoDev**

- Raphael Senna Masseron
- Leticia Alves Lima
- Simone Cristina Nunes

Projeto independente desenvolvido para o **NASA Space Apps Challenge 2026**. O uso de serviços públicos da NASA não implica endosso oficial.
