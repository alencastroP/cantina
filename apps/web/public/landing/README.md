# Imagens da landing

Esta pasta está vazia de propósito. A landing hoje desenha marcadores no lugar
das fotos, e é assim que ela deve continuar até existir foto de verdade — foto
de banco de imagens numa página que vende para doceria é reconhecida na hora, e
converte pior que um espaço em branco honesto.

## O que precisa entrar aqui

| Arquivo             | Onde aparece                        | Formato sugerido |
| ------------------- | ----------------------------------- | ---------------- |
| `doceira.jpg`       | Depoimento, à esquerda              | 1000×1000, JPG   |
| `og.jpg`            | Cartão do link no WhatsApp e redes  | 1200×630, JPG    |
| `clientes/*.svg`    | Faixa de logos                      | SVG monocromático|

## Como trocar o marcador pela foto

O componente `PhotoPlaceholder` (em `src/components/landing/photo-placeholder.tsx`)
tem, no comentário do topo, o trecho exato de `next/image` para colar no lugar
dele. Duas coisas que não são detalhe:

- **`alt` descreve a cena**, não o produto. "Bancada de uma doceria com bolos
  prontos para entrega" — e não "bolo". Quem usa leitor de tela precisa receber
  a mesma informação que a foto dá.
- **`priority` só em foto da primeira dobra** — hoje, nenhuma: o hero não
  usa foto, e sim o palco animado de `hero-stage.tsx`. Fora da primeira
  dobra, ele atrapalha: o navegador passa a baixar tudo de uma vez e a
  primeira imagem demora mais.

## Antes de subir qualquer foto

1. **Autorização por escrito** de quem aparece na imagem e de quem é dono do
   lugar fotografado. Vale para o retrato do depoimento e para a bancada.
2. **Nenhum dado de cliente visível** — comanda com nome e telefone em cima da
   bancada, etiqueta de entrega com endereço, tela de celular com conversa
   aberta. É o erro mais comum em foto de cozinha real, e a foto vai para a
   internet inteira.
3. **Logo de cliente só com autorização da marca.** Enquanto não houver, a
   faixa fica com os marcadores; com uma cliente só, o caminho honesto é
   apagar a seção inteira e deixar o depoimento trabalhar sozinho.
