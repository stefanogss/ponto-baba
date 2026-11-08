# Ponto Eletrônico Doméstico

Controle de jornada para empregada doméstica: registro de ponto com um botão, áudio e ícones; banco de horas; férias; abonos; folgas; fechamento mensal com PDF; comprovante diário por e-mail; e trilha de auditoria com cadeia de hash.

- **Tela de ponto** (página inicial): para a empregada. Sem senha. Só funciona em aparelho cadastrado.
- **Painel** (`#/admin`, link "Administração" no rodapé): para os dois administradores, com senha única e escolha do nome.
- **Dados**: numa planilha Google sua. O GitHub guarda **só o código**.

---

## Sumário

1. [Como funciona](#1-como-funciona)
2. [Criar a planilha e colar o script](#2-criar-a-planilha-e-colar-o-script)
3. [Rodar o `setup()` e autorizar o script](#3-rodar-o-setup-e-autorizar-o-script)
4. [Publicar o Web App](#4-publicar-o-web-app)
5. [Publicar o site no GitHub Pages](#5-publicar-o-site-no-github-pages)
6. [Primeira configuração no painel](#6-primeira-configuração-no-painel)
7. [Cadastrar os aparelhos](#7-cadastrar-os-aparelhos)
8. [Rede da casa (Wi-Fi)](#8-rede-da-casa-wi-fi)
9. [E-mails e gatilho diário](#9-e-mails-e-gatilho-diário)
10. [Carga inicial](#10-carga-inicial)
11. [Rotina do mês](#11-rotina-do-mês)
12. [Testes](#12-testes)
13. [Manutenção](#13-manutenção)
14. [Segurança e limitações conhecidas](#14-segurança-e-limitações-conhecidas)
15. [Decisões de cálculo a conferir](#15-decisões-de-cálculo-a-conferir)
16. [Arquivos](#16-arquivos)

---

## 1. Como funciona

```
Tablet / celular (site no GitHub Pages)
        │  POST (texto JSON)
        ▼
Google Apps Script (Web App)  ──►  Planilha Google (abas protegidas)
        │                     ──►  Pasta no Google Drive (atestados, PDFs, áudios)
        └─ gatilhos: comprovante diário às 20h, alertas às 8h
```

- O **horário oficial** de cada marcação é o do servidor do Google, no fuso de São Paulo.
- **Nada é apagado.** Correção, anulação, abono e reversão são novos registros que apontam para o original.
- Cada ação gera uma linha na aba **Log** com o hash do registro anterior. O botão **Verificar integridade** recalcula a cadeia e aponta a primeira linha alterada, removida ou fora de ordem.

## 2. Criar a planilha e colar o script

> Sugestão: use uma conta Google só para o ponto (ex.: `ponto.casa@gmail.com`). Os e-mails dos comprovantes saem dela e ficam na pasta "Enviados", o que também serve de prova.

1. Entre em <https://sheets.google.com> e crie uma **planilha em branco**. Dê um nome, por exemplo, "Ponto Doméstico".
2. No menu da planilha, clique em **Extensões ▸ Apps Script**. Abre o editor de código.
3. No editor, à esquerda, há um arquivo `Código.gs`. Clique nos três pontinhos ao lado dele ▸ **Renomear** ▸ `Code`.
4. Apague o conteúdo e cole o conteúdo de [`apps-script/Code.gs`](apps-script/Code.gs).
5. Para cada um dos arquivos abaixo, clique em **＋ ▸ Script**, dê **exatamente** o nome indicado (sem o `.gs`) e cole o conteúdo:

   | Nome no editor | Arquivo deste repositório |
   |---|---|
   | `Calculo` | `apps-script/Calculo.gs` |
   | `Dados` | `apps-script/Dados.gs` |
   | `Auditoria` | `apps-script/Auditoria.gs` |
   | `Config` | `apps-script/Config.gs` |
   | `Ponto` | `apps-script/Ponto.gs` |
   | `Admin` | `apps-script/Admin.gs` |
   | `Gestao` | `apps-script/Gestao.gs` |
   | `Espelho` | `apps-script/Espelho.gs` |
   | `Fechamento` | `apps-script/Fechamento.gs` |
   | `Comprovantes` | `apps-script/Comprovantes.gs` |
   | `Setup` | `apps-script/Setup.gs` |

6. Clique na engrenagem (**Configurações do projeto**) ▸ marque **Mostrar arquivo de manifesto "appsscript.json" no editor**. Volte ao editor, abra `appsscript.json` e substitua o conteúdo pelo de [`apps-script/appsscript.json`](apps-script/appsscript.json).
7. Clique no disquete (**Salvar projeto**).

## 3. Rodar o `setup()` e autorizar o script

1. No editor, abra o arquivo `Setup`. Na barra de cima, escolha a função **setup** e clique em **▷ Executar**.
2. O Google pede autorização. Clique em **Revisar permissões**, escolha a conta, e:
   - aparece "O Google não verificou este app": clique em **Avançado ▸ Acessar Ponto… (não seguro)**. É normal: o "app" é o seu próprio script;
   - autorize o acesso à planilha, ao Drive, ao envio de e-mails em seu nome e aos acionadores. **É aqui que se autoriza o envio de e-mails pelo script.**
3. Ao terminar, abra **Registro de execução** (parte de baixo da tela). Aparece:
   `SENHA INICIAL DOS ADMINISTRADORES: xxxxxxxxxxxx`
   **Anote essa senha.** Você vai trocá-la no painel.

O `setup()` cria e protege as abas (`Eventos`, `Log`, `Dispositivos`, `Config`, `Feriados`, `Ferias`, `Abonos`, `BancoHoras`, `Fechamentos`), cria a pasta **"Ponto Doméstico — arquivos"** no Drive (acesso só seu), carrega os feriados nacionais de 2025 até 5 anos à frente e instala os gatilhos. Pode ser rodado de novo sem perder dados.

> Esqueceram a senha? No editor, rode a função **redefinirSenha** e leia a nova senha no Registro de execução (fica registrado no Log).

## 4. Publicar o Web App

1. No editor, clique em **Implantar ▸ Nova implantação**.
2. Em "Selecionar tipo", clique na engrenagem ▸ **App da Web**.
3. Preencha:
   - **Descrição**: `Ponto v1`
   - **Executar como**: **Eu** (sua conta)
   - **Quem pode acessar**: **Qualquer pessoa**
4. Clique em **Implantar** e copie a **URL do app da Web** (termina em `/exec`).

"Qualquer pessoa" é necessário para o site conseguir falar com o script. A segurança está no token do aparelho e na senha: sem eles, o script recusa tudo.

> **Ao atualizar o código depois**: **Implantar ▸ Gerenciar implantações ▸ ✏️ editar ▸ Versão: Nova versão ▸ Implantar**. Assim a URL continua a mesma.

## 5. Publicar o site no GitHub Pages

1. Crie uma conta em <https://github.com> (se não tiver) e um **repositório novo** (pode ser público), por exemplo `ponto`.
2. Copie `config.example.js` para `config.js` e troque `https://script.google.com/macros/s/SEU_ID/exec` pela URL do passo 4.
3. Envie para o repositório todos os arquivos desta pasta (botão **Add file ▸ Upload files**): `index.html`, `styles.css`, `config.js`, `calculo.js`, `api.js`, `app.js`, `admin.js`, `sw.js`, `manifest.json`, `tests.html`, `tests.js`, a pasta `icons` e, se quiser guardar junto, a pasta `apps-script`.
4. No repositório: **Settings ▸ Pages ▸ Build and deployment ▸ Source: Deploy from a branch ▸ Branch: `main` / `(root)` ▸ Save**.
5. Em um ou dois minutos o site fica em `https://SEU-USUARIO.github.io/ponto/`.

**Nunca** coloque no repositório senhas, tokens, e-mails, nomes ou CPFs. Esses dados ficam só na planilha (aba `Config`) e em Script Properties.

## 6. Primeira configuração no painel

1. Abra `https://SEU-USUARIO.github.io/ponto/#/admin`.
2. Escolha um nome na lista (no começo aparecem "Administrador 1" e "Administrador 2"), digite a senha inicial e entre.
3. Vá em **Configurações ▸ Parâmetros** e preencha:
   - **Nomes dos administradores** (ex.: `Maria,João`). Depois de salvar, saia e entre de novo escolhendo o seu nome;
   - **Nome e CPF** do empregador e da empregada (aparecem no PDF do espelho);
   - **E-mail da empregada** e **e-mails dos administradores**;
   - confira jornada, salário, vale e demais parâmetros. Salário-base, vale e divisor pedem uma **data de vigência**.
4. **Feriados**: inclua os feriados **estaduais de Santa Catarina** e **municipais de Florianópolis** (o sistema não os presume). Se Carnaval ou Corpus Christi forem folga na casa, clique em **Ativar** neles.
5. **Trocar senha**: troque a senha inicial e avise o outro administrador.

## 7. Cadastrar os aparelhos

Faça isto **em cada aparelho** que a empregada vai usar:

1. No aparelho, abra o site. Aparece **"Aparelho não autorizado"**: é o esperado.
2. Toque em **Administração** (rodapé), entre com seu nome e a senha.
3. **Configurações ▸ Cadastrar este aparelho**:
   - **Tablet da casa**: apelido "Tablet da casa", **desmarque** "Exigir Wi-Fi da casa";
   - **Celular da babá**: apelido "Celular da babá", **deixe marcado** "Exigir Wi-Fi da casa".
4. Toque em **Sair**, depois em **Tela de ponto**. O botão grande verde **Entrada** aparece.
5. Instale como aplicativo: no Chrome do Android, menu ⋮ ▸ **Adicionar à tela inicial** (ou **Instalar app**). No iPhone, Safari ▸ Compartilhar ▸ **Adicionar à Tela de Início**.

Para revogar um aparelho (perdido, trocado): **Configurações ▸ Aparelhos ▸ Revogar**.

## 8. Rede da casa (Wi-Fi)

O navegador não consegue ler o nome da rede Wi-Fi. Por isso, o sistema compara o **IP público** da conexão no momento da marcação com a lista de IPs autorizados.

1. **Conectado ao Wi-Fi da casa**, abra o painel ▸ **Configurações ▸ Rede da casa ▸ Autorizar a rede atual**.
2. Provedores trocam o IP de tempos em tempos. Quando isso acontecer, o celular passa a ouvir "Conecte o celular no Wi-Fi da casa", a recusa aparece em **Hoje** e em **Pendências**, e basta repetir o passo 1 de dentro de casa.
3. O tablet (sem a exigência) continua funcionando normalmente.

## 9. E-mails e gatilho diário

- O `setup()` já instala dois gatilhos: **comprovante diário** (padrão 20h; o Google executa em algum minuto dentro dessa hora) e **alertas** às 8h (banco a 60 e 30 dias do vencimento; férias a 90/60/30 dias do fim do concessivo; aviso de 30 dias e de pagamento).
- Para mudar o horário: **Configurações ▸ Parâmetros ▸ Hora do comprovante diário**. Os gatilhos são reinstalados ao salvar.
- Para testar: **Configurações ▸ Comprovantes ▸ Enviar comprovante de hoje agora**.
- Falhou o envio? Uma nova tentativa é agendada em 30 minutos, e a falha aparece em **Pendências**.
- Para conferir os gatilhos no editor: ícone de relógio (**Acionadores**) à esquerda.
- O Gmail gratuito permite cerca de 100 e-mails por dia por script: folga ampla para 3 destinatários.

**WhatsApp (opcional, depois):** o envio passa por `enviarComprovante(destinatario, conteudo)`, com adaptadores em `Comprovantes.gs`. Para ligar:
- **CallMeBot** (gratuito, não oficial): obtenha a apikey no site do CallMeBot; no editor, **Configurações do projeto ▸ Propriedades do script ▸ Adicionar** `CALLMEBOT_APIKEY`; no painel, preencha os telefones e ponha `email,callmebot` em "Canal do comprovante".
- **WhatsApp Cloud API** (oficial, paga por mensagem): grave `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_ID` nas Propriedades do script e use `email,whatsapp_cloud`.
- Chaves **nunca** vão na planilha nem no GitHub.

## 10. Carga inicial

Use uma vez, em **Carga inicial**:

- **Primeiro mês apurado pelo sistema** (ex.: `2026-11`). Meses anteriores não são apurados nem fechados pelo sistema.
- **Saldo do banco**: uma linha por crédito, com a data de origem (o vencimento é calculado em 12 meses). Ex.: `2026-08-31;05:30`. Débito: `2026-09-30;-02:00`.
- **Férias já gozadas**: `início do período aquisitivo;início do gozo;dias`. Ex.: `2025-06-04;2026-07-01;15`.
- **Meses já fechados fora do sistema**: `2025-06, 2025-07, …`.

Tudo fica no Log como "carga inicial".

## 11. Rotina do mês

1. **Pendências**: resolva os dias inconsistentes (ex.: dia sem saída) em **Corrigir marcação** ou clicando no dia no **Espelho**. Toda correção exige justificativa e mostra antes e depois.
2. A partir do dia 1º do mês seguinte: **Fechamento ▸ Fechar**. O sistema:
   - lança o banco de horas (até 40h a pagar; excedente com validade de 12 meses; créditos vencidos viram "a pagar");
   - gera o **PDF do espelho** (sem valores em reais), salva no Drive e grava o **hash SHA-256**;
   - envia o PDF por e-mail à empregada e aos administradores.
3. **Ciência digital**: na tela da empregada aparece o botão **Ver meu mês**. Ela vê os totais com ícones, ouve em voz alta e toca em **Estou ciente**. Ficam gravados data, hora, aparelho e hash do PDF.
4. **Ciência em papel** (recomendada): imprima o PDF, **leia o espelho para ela**, colham as assinaturas e anexe a digitalização em **Fechamento ▸ Anexar folha assinada**.
5. Precisa alterar um mês fechado? **Reabrir** (com justificativa). Os lançamentos do banco daquela versão deixam de valer, e o novo fechamento gera a versão 2 (PDF e ciência novos). As versões anteriores ficam preservadas. Só se reabre o último mês fechado.

**Valores estimados** (só no painel): horas extras × 1,5; DSR/feriado × 2; intervalo suprimido × 1,5; reflexo no DSR opcional. *"Valores estimados. O cálculo oficial é do contador."*

## 12. Testes

Abra `https://SEU-USUARIO.github.io/ponto/tests.html`. A página roda os casos da especificação (tolerância, Súmula 366, intervalo suprimido, sábado, domingo, banco de 40h, saldo negativo, crédito vencido, férias, marcação offline, detecção de adulteração no Log etc.) e mostra ✔ ou ✘ em cada um.

`tests-backend.html` simula o Apps Script no navegador (planilha, Drive, e-mail e relógio falsos) e exercita o backend de ponta a ponta: cadastro de aparelhos, recusa por rede, toque duplo, saída sem intervalo, correção da empregada, sincronização offline, correção do administrador, abono, folga, férias, relatórios, comprovante diário, fechamento com PDF, ciência, reabertura com versão 2, revogação de aparelho, verificação de integridade e bloqueio de login. Não acessa nenhum dado real.

## 13. Manutenção

- **Atualizar o `Calculo.gs`**: as regras de cálculo estão em `calculo.js` (usado pelo site e pelos testes) e numa cópia idêntica, `apps-script/Calculo.gs`. Se alterar uma, copie o conteúdo para a outra, rode `tests.html` e publique nova versão do Web App (passo 4, "Ao atualizar").
- **Atualizar o site**: envie os arquivos alterados ao GitHub. Se mudar arquivos do site, altere também `VERSAO` em `sw.js` (ex.: `ponto-v2`) para os aparelhos buscarem a versão nova.
- **Retenção**: mantenha a planilha e a pasta do Drive por no mínimo **5 anos após o fim do contrato**. Não há exclusão automática.
- **Prova adicional**: o histórico de versões nativo da planilha (**Arquivo ▸ Histórico de versões**) mostra qualquer edição manual.

## 14. Segurança e limitações conhecidas

- **Senha única + nome autodeclarado.** A senha é dos dois administradores; o que distingue quem fez cada alteração é o nome escolhido no login. A tela de login diz isso explicitamente. Sessão expira após 30 min sem uso; 5 senhas erradas bloqueiam por 15 min (tudo no Log).
- **Verificação de rede por IP informado pelo navegador.** Um usuário com conhecimento técnico poderia, em tese, contorná-la. O Apps Script não recebe o IP real da requisição, por isso o IP vem do site (serviço ipify). Risco baixo e aceito na especificação.
- **O dono da planilha pode editá-la.** As abas são protegidas contra outros usuários, mas o Google não permite tirar o acesso do proprietário (que é a mesma conta do script). Qualquer edição manual quebra a cadeia de hash, que a **Verificar integridade** aponta, e fica no histórico de versões.
- **Marcação offline** usa o horário do aparelho e sempre recebe os alertas "Horário do aparelho" e "Rede não verificada" (e "Relógio do aparelho divergente" se a diferença passar de 10 min no envio).
- **Correções da empregada** são possíveis só no próprio dia e exigem internet. Dias anteriores: só o administrador.
- **Token do aparelho**: guardado no navegador (localStorage e IndexedDB). Limpar os dados do navegador apaga o cadastro: basta cadastrar o aparelho de novo e revogar o antigo.
- O site é público, mas marcado com `noindex`. Sem token ou senha, o script não aceita nada.

## 15. Decisões de cálculo a conferir

Pontos em que a implementação precisou interpretar a especificação. Recomenda-se conferir com o contador:

1. **Férias 10 + 20 dias.** A especificação pede que seja recusado, mas a regra legal que ela própria cita (art. 17, § 2º, LC n. 150/2015: até dois períodos, **um deles** com no mínimo 14 dias) admite 10 + 20. O sistema segue a lei: aceita 10 + 20, recusa três períodos, recusa dois períodos sem nenhum com 14 dias e exige que dois períodos somem 30. Se a casa quiser a regra mais rígida, ajuste **"Férias: mínimo de dias de CADA período"** para 14 (aí 10 + 20 passa a ser recusado). Os testes mostram os dois comportamentos.
2. **Saldo positivo do mês com banco negativo.** Antes de separar as 40h "a pagar", o saldo positivo primeiro quita o saldo negativo anterior do banco.
3. **Intervalo exigido só acima de 6h de jornada bruta.** O intervalo suprimido (art. 71, § 4º) só é calculado quando a jornada do dia passa de 6h. Um sábado de 4h sem intervalo, por exemplo, não gera intervalo suprimido.
4. **Intervalo suprimido fora do banco** (parâmetro `intervalo_suprimido_tambem_no_banco = nao`): no dia com intervalo menor que 30 min, o banco considera 30 min de intervalo, para não pagar o mesmo tempo duas vezes.
5. **Tolerância.** Variações consideradas: entrada, saída e **duração** do intervalo (não o horário de início). Dentro de 5 min por variação e 10 min no total, nada conta; acima disso, conta a diferença inteira do dia (Súmula 366). Dias com folga parcial ou abono parcial não aplicam tolerância.
6. **Domingo/feriado** vai para "Trabalho em DSR/feriado" (dobro), fora do banco. Se o administrador lançar folga indicando a data compensada, o tempo deixa de ser pago em dobro e a folga não debita o banco.
7. **Vigência do salário**: os valores estimados usam o salário, vale e divisor vigentes no **último dia** do mês.
8. **Reflexo no DSR** (opcional): HE do mês ÷ dias úteis × domingos e feriados do mês.
9. **Dia da Consciência Negra (20/11)** está entre os feriados nacionais (Lei n. 14.759/2023).

## 16. Arquivos

| Arquivo | Conteúdo |
|---|---|
| `index.html` | Página única: tela de ponto (`#/`) e painel (`#/admin`) |
| `app.js` | Tela da empregada: botão, áudio, intervalo na saída, correção do dia, offline, ciência |
| `admin.js` | Painel: hoje, pendências, espelho, correções, banco, folgas, férias, abonos, valores, fechamento, relatórios, log, configurações, carga inicial |
| `api.js` | Chamadas ao Apps Script, IP público, IndexedDB (token e fila offline) |
| `calculo.js` | Regras de cálculo puras (cópia em `apps-script/Calculo.gs`) |
| `styles.css`, `icons/` | Visual e ícones próprios |
| `sw.js`, `manifest.json` | PWA instalável e funcionamento offline |
| `config.example.js` | Modelo do `config.js` (URL do Web App) |
| `tests.html`, `tests.js` | Testes automatizados das regras de cálculo |
| `tests-backend.html` | Simulação do backend de ponta a ponta |
| `apps-script/` | Backend (Apps Script) e `appsscript.json` |
