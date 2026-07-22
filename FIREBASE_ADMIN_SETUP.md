# Ativar o Painel Administrativo

O painel foi criado em `HTML/admin.html`, mas começa bloqueado por segurança. Siga estas etapas antes de publicar a atualização.

## 1. Copiar o UID da sua conta

1. Abra o [Firebase Console](https://console.firebase.google.com/).
2. Entre no projeto usado pelo Mercado Pro Clubs.
3. Abra **Authentication** e depois **Users**.
4. Encontre a sua conta e copie o valor da coluna **User UID**.

O UID é o identificador único da sua conta. Não use seu e-mail como ID do documento.

## 2. Criar o seu administrador

1. No Firebase Console, abra **Firestore Database**.
2. Crie a coleção `admins`.
3. Crie um documento usando exatamente o seu **UID como Document ID**.
4. Adicione estes campos:

| Campo | Tipo | Valor sugerido |
|---|---|---|
| `ativo` | boolean | `true` |
| `nome` | string | seu nome |
| `permissoes` | map | mapa descrito abaixo |

Dentro do mapa `permissoes`, adicione:

| Campo | Tipo | Valor |
|---|---|---|
| `verPainel` | boolean | `true` |
| `moderarConteudo` | boolean | `true` |

Use `moderarConteudo: false` se quiser que a conta apenas consulte os dados, sem remover vagas nem atualizar denúncias.

Exemplo da estrutura final:

```text
admins
└── SEU_UID
    ├── ativo: true
    ├── nome: "Nicolas"
    └── permissoes
        ├── verPainel: true
        └── moderarConteudo: true
```

## 3. Proteger os dados no Firestore

Use agora o arquivo completo `firestore.rules`. Ele já reúne as permissões do
site e do painel administrativo, portanto substitui o trecho antigo de exemplo.

1. Abra **Firestore Database > Regras**.
2. Copie todo o conteúdo de `firestore.rules`.
3. Substitua as regras atuais e clique em **Publicar**.

O passo a passo resumido também está em `FIREBASE_SECURITY_SETUP.md`.

> Importante: esconder a página ou o link não protege o banco; a proteção real é feita pelo Firestore.

## 4. Testar o acesso

1. Saia da sua conta no Mercado Pro Clubs.
2. Entre novamente com a mesma conta cujo UID foi cadastrado em `admins`.
3. Abra o menu da sua foto no cabeçalho.
4. Clique em **Painel administrativo**.
5. Confirme que as métricas e listas carregam.
6. Teste primeiro **Marcar como analisada** em uma denúncia de teste.

Se aparecer “sem permissão para carregar”, revise as regras do Firestore e confirme que o ID do documento é exatamente o UID da conta conectada.

## Limite desta primeira versão

O painel consegue consultar jogadores, clubes, vagas, denúncias e convites; também remove vagas, atualiza denúncias e registra essas ações em `logsAdmin`.

Bloquear o login de uma conta diretamente no Firebase Authentication exige um ambiente seguro com Firebase Admin SDK, como Cloud Functions ou um servidor. Isso não deve ser feito apenas pelo JavaScript do navegador e ficou fora desta primeira versão.
