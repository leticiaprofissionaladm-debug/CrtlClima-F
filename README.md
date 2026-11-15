# CTRLClima — Frontend

Interface React + TypeScript + Vite da equipe VulcanoDev. O design original foi mantido nesta revisão.

## Executar localmente

1. Instale Node.js `22.22.3` ou superior.
2. Execute `npm install`.
3. Copie `.env.example` para `.env`.
4. Confirme `VITE_API_URL=http://localhost:3000/api`.
5. Execute `npm run dev`.

O backend NestJS precisa estar em execução para consultar Giovanni, AppEEARS e os serviços de localização.

## Idiomas

A interface usa i18next e oferece português (`pt`), inglês (`en`) e espanhol (`es`). O idioma escolhido é salvo no navegador.

## Verificações

- `npm run build`: verificação TypeScript e build Vite.
- `npm run lint`: análise estática com Oxlint.

Não há dados climáticos demonstrativos alimentando os gráficos. A visualização histórica depende de uma série real interpretada ou de um CSV importado pelo usuário.
