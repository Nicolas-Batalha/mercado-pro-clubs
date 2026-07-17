# Mercado Pro Clubs

Plataforma brasileira para jogadores e clubes de EA FC Pro Clubs encontrarem vagas, negociarem, conhecerem clubes e participarem de torneios.

## Funcionalidades

- Cadastro e acesso com Firebase Authentication
- Perfil de jogador e configuracao de clube
- Mercado de vagas e jogadores
- Candidaturas, convites, negociacoes e chat
- Diretorio publico de clubes
- Torneios e inscricoes de clubes
- Chaves mata-mata, envio de placares pelos capitaes, homologacao e campeao
- Painel administrativo e moderacao
- Layout responsivo para computador e celular

## Tecnologias

- HTML, CSS e JavaScript
- Firebase Authentication e Cloud Firestore
- Hospedagem na Vercel

## Executar localmente

O projeto usa modulos JavaScript. Abra a pasta por um servidor HTTP local, como a extensao Live Server do VS Code.

## Seguranca

- Nunca envie senhas, chaves privadas, contas de servico ou arquivos `.env` ao GitHub.
- A configuracao web do Firebase identifica o projeto, mas a protecao real dos dados depende das regras do Firestore.
- O arquivo `firestore.rules` deve ser publicado no Firebase Console e nao e enviado ao navegador pela Vercel.

## Aviso legal

O Mercado Pro Clubs e uma plataforma independente, sem vinculo oficial com a EA Sports. Todas as marcas registradas pertencem aos seus respectivos proprietarios.
