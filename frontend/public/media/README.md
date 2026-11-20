# Vídeo de Fundo da Vitrine (`Destaques / Boas-vindas`)

Esta pasta guarda o vídeo ambiente exibido no topo da página inicial (`.sympla-top-bar`).

## Como trocar para um vídeo de sua autoria

1. Salve o seu vídeo em loop curto (recomendado: 6s a 15s, MP4 H.264 ou WebM, sem áudio e leve para web) aqui nesta pasta — por exemplo `meu-video-eventos.mp4` — e opcionalmente uma imagem de prévia (`hero-events-poster.jpg`).
2. Abra [heroMedia.ts](../../src/config/heroMedia.ts) e atualize `sources` e `poster` em `HERO_AMBIENT_MEDIA`:

```ts
export const HERO_AMBIENT_MEDIA = {
  poster: '/media/hero-events-poster.jpg',
  sources: [
    { src: '/media/meu-video-eventos.mp4', type: 'video/mp4' },
  ],
}
```

3. Salve e rode `npm --prefix frontend run build` para conferir antes de enviar para produção.
