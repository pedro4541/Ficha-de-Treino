# Ficha-de-Treino

Apps de treino publicados no GitHub Pages (`https://pedro4541.github.io/Ficha-de-Treino/`).

| App | Página | Plano | Planilha |
|---|---|---|---|
| Caroline & Pedro | `treinos.html` | (dentro do HTML) | Apps Script próprio |
| Corrida 5k | `5k.html` | (dentro do HTML) | Apps Script próprio |
| Nat & Vlad | `treino_natalie_vlad.html` | `planos/natalie-vlad.json` | Apps Script próprio |
| Matheus | `treino_matheus.html` | `planos/matheus.json` | Apps Script próprio |

## Motor compartilhado (Nat & Vlad, Matheus e próximos)

```
app/engine.js     ← toda a lógica (telas, timers, sync, gráficos)
app/engine.css    ← estilos base com variáveis de tema
sw.js             ← service worker (offline), registrado com escopo só da página
planos/*.json     ← treinos de cada app
backend/apps-script.gs ← backend único (cada app implanta uma cópia com sua planilha)
```

Cada página (`treino_*.html`) só define o tema (variáveis CSS) e `window.APP`
(id, título, versão, plano e URL `/exec` do Apps Script).

### Novo app
1. Crie `planos/<nome>.json` no mesmo formato dos existentes.
2. Copie `treino_matheus.html` → `treino_<nome>.html`: troque `window.APP` (id único!), o tema e o ícone.
3. Copie o `.webmanifest` e os ícones em `icons/`.
4. Cole `backend/apps-script.gs` em um novo projeto do script.google.com, troque `NOME_PLANILHA`,
   rode `setup()` e implante como App da Web (executar como: eu · acesso: qualquer pessoa).
5. Coloque a URL `/exec` em `gsUrl`.

Atualizar o Apps Script: Implantar → Gerenciar implantações → lápis → **Nova versão** (nunca "Nova implantação").
