# Publicar as regras de segurança

O arquivo `firestore.rules` é a regra completa do projeto. Ele substitui o
trecho antigo e já inclui jogadores, clubes, vagas, candidaturas, convites,
chats, denúncias e o painel administrativo.

## Pelo Console do Firebase

1. Abra **Firestore Database**.
2. Entre na aba **Regras**.
3. Copie todo o conteúdo de `firestore.rules`.
4. Substitua o texto atual e clique em **Publicar**.

## Resultado esperado

- Perfis, clubes e vagas continuam públicos para consulta.
- Cada usuário altera somente os próprios dados.
- Capitães controlam somente vagas, convites e candidaturas do próprio clube.
- Candidaturas e conversas ficam visíveis apenas para seus participantes.
- Mensagens só podem ser enviadas pelo usuário autenticado que participa do chat.
- Denúncias ficam privadas e acessíveis apenas ao painel administrativo.

O arquivo `firebase.json` permite publicar a mesma regra futuramente pelo Firebase CLI.
