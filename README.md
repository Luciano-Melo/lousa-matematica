# Lousa matemática

Uma lousa local, discreta e sem dependências para estudar matemática dentro do navegador ou na extensão Live Preview do VS Code.

## Publicação

O projeto inclui um workflow em `.github/workflows/pages.yml`. Todo envio para a branch `main` publica automaticamente a versão atual no GitHub Pages.

## Usar

Abra `index.html` no navegador. No VS Code, você também pode usar **Open with Live Server** ou **Show Preview**.

> Abra o arquivo HTML, não uma captura PNG. A captura abre no visualizador de imagens do VS Code e mostra uma lupa em vez dos controles interativos.

- **Mover (V):** seleciona e arrasta itens. Clique duas vezes em um texto para editá-lo.
- **Seleção (S):** clique e arraste um retângulo ao redor dos itens desejados. Depois use **Mover** para arrastar o conjunto. Segure `Shift` para acrescentar outra área; **Todos** ou `Ctrl+A` seleciona tudo.
- No modo **Mover**, arraste uma área vazia para navegar pela lousa nos dois eixos. Também funciona com um dedo no celular, `Espaço + arrastar` ou o botão do meio do mouse.
- No modo **Mover**, qualquer texto, símbolo, fração ou rabisco mostra quatro bolinhas verdes. Arraste uma delas para alterar livremente a largura e a altura do item.
- **Lápis (P):** desenho livre.
- **Borracha (E):** apaga o item sob o cursor.
- **Apagador (A):** possui traço suavizado e tamanho regulável de 6 a 140. Em textos, o caractere é removido do conteúdo editável quando pelo menos 50% de sua área é apagada.
- **Texto (T):** clique na ferramenta e já comece a digitar; `Enter` confirma. Você também pode clicar em outro ponto da lousa para escolher a posição.
- **Editar texto (R):** ative a ferramenta e clique em um texto, número ou símbolo existente para alterar seu conteúdo.
- **Duplicar (D):** ative a ferramenta e clique em um texto ou rabisco para criar uma cópia selecionada e arrastável.
- **Calc (C):** abre uma calculadora rápida. O resultado pode ser enviado diretamente para a lousa.
- **Fração (F):** adiciona uma barra de fração.
- `Delete`: remove o item selecionado.
- `Ctrl+Z` / `Ctrl+Y`: desfazer / refazer.
- `Shift + scroll` no computador ou pinça com dois dedos no celular: aumentar ou diminuir o zoom. Clique na porcentagem no canto da lousa para voltar a 100%.
- **Modo discreto:** reduz o painel a uma faixa de ícones. Use o botão **Discreto** ou `Ctrl+\` para alternar. No celular, segure o primeiro botão e arraste para posicionar a faixa para cima ou para baixo.

O conteúdo fica salvo automaticamente no armazenamento local do navegador. O botão **PNG** exporta a lousa como imagem.

## Instalar no iPhone

Depois de publicar o projeto em um endereço HTTPS, abra-o no Safari, toque em **Compartilhar**, escolha **Adicionar à Tela de Início**, ative **Abrir como App** e toque em **Adicionar**. A lousa possui manifesto, ícones, áreas seguras para iPhone e service worker para continuar abrindo sem internet após o primeiro acesso.

No celular, o painel compacto é ativado automaticamente. Toque no primeiro botão da faixa para abrir o painel completo sobre a lousa e toque novamente para recolhê-lo.
