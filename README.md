# Mercado Pro Clubs

Plataforma brasileira para jogadores e clubes de EA FC Pro Clubs encontrarem vagas, negociarem, conhecerem clubes e participarem de torneios.

## Funcionalidades

- Cadastro e acesso com Firebase Authentication
- Perfil de jogador e configuracao de clube
- Mercado de vagas e jogadores
- Candidaturas, convites, negociacoes e chat
- Diretorio publico de clubes
- Torneios completos com inscricoes, aprovacao, chaveamento automatico, envio de placares pelos capitaes, homologacao administrativa e campeao
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

## Ativação final dos e-mails da conta

O site possui a página própria `HTML/acao-email.html` para confirmar e-mail, recuperar endereço e trocar senha. Para ela receber os links do Firebase:

1. Abra **Firebase Console > Authentication > Templates**.
2. Em cada modelo de e-mail, abra a configuração da URL de ação.
3. Use `https://www.mercadoproclubs.com/HTML/acao-email.html`.
4. Em **Customize domain**, configure `auth.mercadoproclubs.com` e copie exatamente os registros DNS fornecidos pelo Firebase.
5. Depois que o Firebase mostrar o domínio como verificado, aplique a alteração em todos os modelos e envie um teste.

Não adicione chaves privadas, arquivos de conta de serviço ou segredos de e-mail ao projeto.
