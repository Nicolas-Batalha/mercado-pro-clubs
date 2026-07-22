# Segurança do Mercado Pro Clubs

As proteções de código e as regras do Firestore estão neste projeto. Para concluir a configuração, publique o site e as regras juntas e depois faça os passos abaixo no Firebase.

## 1. Publicar as regras

No Firebase Console, abra **Firestore > Regras**, cole o conteúdo de `firestore.rules` e clique em **Publicar**.

## 2. Proteger os e-mails antigos

Depois de publicar as regras e o site:

1. Entre no painel administrativo.
2. Abra **Manutenção**.
3. Clique em **Proteger e-mails agora**.
4. Confirme a operação.

O processo apenas move `email` de `jogadores/{uid}` para `jogadoresPrivados/{uid}`. Foto, overall e level não são alterados.

## 3. Política de senhas

No Firebase Console, abra **Authentication > Configurações > Política de senha** e exija:

- no mínimo 10 caracteres;
- letra maiúscula;
- letra minúscula;
- número;
- símbolo.

Ative também a proteção contra enumeração de e-mails, se ela estiver disponível no projeto.

## 4. App Check

No Firebase Console, abra **App Check**, registre o aplicativo Web com **reCAPTCHA Enterprise** e aplique a proteção primeiro em modo de monitoramento. Depois de confirmar que as requisições legítimas aparecem, ative a fiscalização para Firestore e Authentication.

O App Check precisa da chave pública criada no console para ser ligado no JavaScript. Não coloque chave secreta ou arquivo de conta de serviço no site.

## 5. Conta administrativa

- Use uma conta Google exclusiva para administração.
- Ative a verificação em duas etapas nessa conta.
- Não compartilhe o acesso ao documento `admins/{uid}`.
- Mantenha `moderarConteudo: true` somente para administradores que realmente removem conteúdo.

## 6. Checklist após publicar

- cadastro por e-mail exige confirmação;
- usuário não verificado não publica, convida, candidata ou envia mensagem;
- e-mails não aparecem nos documentos públicos de jogadores;
- o painel continua exibindo e-mails apenas para administradores;
- as páginas abrem normalmente com o login do Google;
- os cabeçalhos de segurança aparecem na resposta da Vercel.
