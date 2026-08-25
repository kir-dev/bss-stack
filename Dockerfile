FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable \
    && corepack prepare pnpm@11.15.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build


FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=build --chown=node:node /app/.output ./.output

USER node

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]