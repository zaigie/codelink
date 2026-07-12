import { createHash, randomUUID } from "node:crypto";

import type { WeixinSession } from "../state.js";
import { WeixinApiError } from "./client.js";

export type SendTextParams = {
  session: WeixinSession;
  toUserId: string;
  contextToken: string;
  text: string;
  clientId?: string;
};

export type WeixinTextSender = {
  sendText(params: SendTextParams): Promise<void>;
};

export type TextDeliveryInput = Omit<SendTextParams, "clientId"> & {
  deliveryKey?: string;
};

export type DeliveryReceipt = {
  totalChunks: number;
  sentChunks: number;
  deliveredText: string;
  failedChunk?: string;
  failedChunkIndex?: number;
  errorCode?: number;
  error?: string;
};

export type TextDeliveryOptions = {
  clientIdFactory?: () => string;
  interChunkDelayMs?: number;
  retryDelaysMs?: readonly number[];
  sleep?: (milliseconds: number) => Promise<void>;
};

const deliveryQueues = new Map<string, Promise<void>>();

export class WeixinTextDelivery {
  private readonly clientIdFactory: () => string;
  private readonly interChunkDelayMs: number;
  private readonly retryDelaysMs: readonly number[];
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(
    private readonly sender: WeixinTextSender,
    options: TextDeliveryOptions = {},
  ) {
    this.clientIdFactory =
      options.clientIdFactory ?? (() => `codelink-${randomUUID()}`);
    this.interChunkDelayMs = options.interChunkDelayMs ?? 200;
    this.retryDelaysMs = options.retryDelaysMs ?? [250, 750];
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async sendText(input: TextDeliveryInput): Promise<DeliveryReceipt> {
    const previous = deliveryQueues.get(input.toUserId) ?? Promise.resolve();
    const delivery = previous.then(
      () => this.deliver(input),
      () => this.deliver(input),
    );
    const tail = delivery.then(
      () => undefined,
      () => undefined,
    );
    deliveryQueues.set(input.toUserId, tail);
    return delivery.finally(() => {
      if (deliveryQueues.get(input.toUserId) === tail) {
        deliveryQueues.delete(input.toUserId);
      }
    });
  }

  private async deliver(input: TextDeliveryInput): Promise<DeliveryReceipt> {
    const chunks = splitTextForDelivery(input.text, 2_048);
    const { deliveryKey, ...sendInput } = input;
    let deliveredText = "";
    for (const [index, chunk] of chunks.entries()) {
      try {
        const params = {
          ...sendInput,
          text: chunk.text,
          clientId: deliveryKey
            ? stableClientId(deliveryKey, index)
            : this.clientIdFactory(),
        };
        if (index > 0 && this.interChunkDelayMs > 0) {
          await this.sleep(this.interChunkDelayMs);
        }
        await this.sendChunk(params);
        deliveredText += chunk.sourceText;
      } catch (error) {
        return {
          totalChunks: chunks.length,
          sentChunks: index,
          deliveredText,
          failedChunk: chunk.sourceText,
          failedChunkIndex: index,
          ...(error instanceof WeixinApiError && error.errorCode !== undefined
            ? { errorCode: error.errorCode }
            : {}),
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return {
      totalChunks: chunks.length,
      sentChunks: chunks.length,
      deliveredText,
    };
  }

  private async sendChunk(params: SendTextParams): Promise<void> {
    let retry = 0;
    while (true) {
      try {
        await this.sender.sendText(params);
        return;
      } catch (error) {
        if (
          !(error instanceof WeixinApiError) ||
          error.errorCode !== -2 ||
          retry >= this.retryDelaysMs.length
        ) {
          throw error;
        }
        await this.sleep(this.retryDelaysMs[retry]);
        retry += 1;
      }
    }
  }
}

type DeliveryChunk = { text: string; sourceText: string };

function splitTextForDelivery(text: string, maxBytes: number): DeliveryChunk[] {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return [{ text, sourceText: text }];
  }
  const fences = findFencedBlocks(text);
  if (
    !fences.some(
      (range) =>
        Buffer.byteLength(text.slice(range.start, range.end), "utf8") >
        maxBytes,
    )
  ) {
    return splitUtf8Text(text, maxBytes).map((chunk) => ({
      text: chunk,
      sourceText: chunk,
    }));
  }

  const chunks: DeliveryChunk[] = [];
  let cursor = 0;
  for (const fence of fences) {
    if (fence.start > cursor) {
      chunks.push(
        ...splitUtf8Text(text.slice(cursor, fence.start), maxBytes).map(
          (chunk) => ({ text: chunk, sourceText: chunk }),
        ),
      );
    }
    const source = text.slice(fence.start, fence.end);
    chunks.push(
      ...(Buffer.byteLength(source, "utf8") <= maxBytes
        ? [{ text: source, sourceText: source }]
        : splitOversizedFence(source, maxBytes)),
    );
    cursor = fence.end;
  }
  if (cursor < text.length) {
    chunks.push(
      ...splitUtf8Text(text.slice(cursor), maxBytes).map((chunk) => ({
        text: chunk,
        sourceText: chunk,
      })),
    );
  }
  return chunks;
}

function splitOversizedFence(
  source: string,
  maxBytes: number,
): DeliveryChunk[] {
  const openingEnd = source.indexOf("\n") + 1;
  const openingLine =
    openingEnd > 0 ? source.slice(0, openingEnd) : `${source}\n`;
  const markerMatch = /^ {0,3}(`{3,}|~{3,})/.exec(openingLine);
  if (!markerMatch) {
    return splitUtf8Text(source, maxBytes).map((chunk) => ({
      text: chunk,
      sourceText: chunk,
    }));
  }
  const marker = markerMatch[1];
  const rest = openingEnd > 0 ? source.slice(openingEnd) : "";
  const closingStart = findClosingFenceStart(rest, marker);
  const body = closingStart >= 0 ? rest.slice(0, closingStart) : rest;
  const originalClosing = closingStart >= 0 ? rest.slice(closingStart) : "";
  const syntheticClosing = `${marker}\n`;
  const overhead =
    Buffer.byteLength(openingLine, "utf8") +
    Math.max(
      Buffer.byteLength(syntheticClosing, "utf8"),
      Buffer.byteLength(originalClosing, "utf8"),
    );
  const bodyLimit = maxBytes - overhead;
  if (bodyLimit <= 0) {
    return splitUtf8Text(source, maxBytes).map((chunk) => ({
      text: chunk,
      sourceText: chunk,
    }));
  }
  const pieces = splitRawUtf8Text(body, bodyLimit);
  return pieces.map((piece, index) => {
    const last = index === pieces.length - 1;
    return {
      text: `${openingLine}${piece}${last && originalClosing ? originalClosing : syntheticClosing}`,
      sourceText: `${index === 0 ? openingLine : ""}${piece}${last ? originalClosing : ""}`,
    };
  });
}

function findClosingFenceStart(text: string, openingMarker: string): number {
  let lineStart = 0;
  while (lineStart < text.length) {
    const newline = text.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? text.length : newline + 1;
    const line = text.slice(lineStart, lineEnd);
    const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (
      match &&
      match[1][0] === openingMarker[0] &&
      match[1].length >= openingMarker.length &&
      line.slice(match[0].length).trim() === ""
    ) {
      return lineStart;
    }
    lineStart = lineEnd;
  }
  return -1;
}

function splitRawUtf8Text(text: string, maxBytes: number): string[] {
  if (!text) return [""];
  const chunks: string[] = [];
  let current = "";
  let bytes = 0;
  for (const character of text) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (current && bytes + characterBytes > maxBytes) {
      chunks.push(current);
      current = "";
      bytes = 0;
    }
    current += character;
    bytes += characterBytes;
  }
  if (current) chunks.push(current);
  return chunks;
}

function stableClientId(deliveryKey: string, chunkIndex: number): string {
  const digest = createHash("sha256")
    .update(`${deliveryKey}:${chunkIndex}`)
    .digest("hex")
    .slice(0, 32);
  return `codelink-${digest}`;
}

function splitUtf8Text(text: string, maxBytes: number): string[] {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return [text];

  const chunks: string[] = [];
  const protectedBlocks = [
    ...findFencedBlocks(text),
    ...findListItems(text),
  ].sort((left, right) => left.start - right.start);
  let start = 0;
  while (start < text.length) {
    let bytes = 0;
    let end = start;
    let lastNewline = -1;
    let lastParagraph = -1;

    for (const character of text.slice(start)) {
      const nextBytes = bytes + Buffer.byteLength(character, "utf8");
      if (nextBytes > maxBytes) break;
      bytes = nextBytes;
      end += character.length;
      if (character === "\n") {
        lastNewline = end;
        if (text[end - 2] === "\n") lastParagraph = end;
      }
    }

    if (end === text.length) {
      chunks.push(text.slice(start));
      break;
    }
    const preferredSplit =
      lastParagraph > start
        ? lastParagraph
        : lastNewline > start
          ? lastNewline
          : end;
    const enclosingBlock = protectedBlocks.find(
      (block) =>
        block.start < preferredSplit && preferredSplit < block.end,
    );
    // A Markdown block larger than Weixin's hard limit cannot remain atomic.
    const splitAt =
      enclosingBlock &&
      enclosingBlock.start > start &&
      Buffer.byteLength(
        text.slice(enclosingBlock.start, enclosingBlock.end),
        "utf8",
      ) <= maxBytes
        ? enclosingBlock.start
        : preferredSplit;
    chunks.push(text.slice(start, splitAt));
    start = splitAt;
  }
  return chunks;
}

type TextRange = { start: number; end: number };

function findFencedBlocks(text: string): TextRange[] {
  const blocks: TextRange[] = [];
  let open: { start: number; marker: string } | null = null;
  let lineStart = 0;

  while (lineStart < text.length) {
    const newline = text.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? text.length : newline + 1;
    const line = text.slice(lineStart, lineEnd);
    const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (match) {
      const marker = match[1];
      if (!open) {
        open = { start: lineStart, marker };
      } else if (
        marker[0] === open.marker[0] &&
        marker.length >= open.marker.length &&
        line.slice(match[0].length).trim() === ""
      ) {
        blocks.push({ start: open.start, end: lineEnd });
        open = null;
      }
    }
    lineStart = lineEnd;
  }

  if (open) blocks.push({ start: open.start, end: text.length });
  return blocks;
}

function findListItems(text: string): TextRange[] {
  const items: TextRange[] = [];
  let itemStart: number | undefined;
  let lineStart = 0;

  while (lineStart < text.length) {
    const newline = text.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? text.length : newline + 1;
    const line = text.slice(lineStart, lineEnd);
    const startsItem = /^ {0,3}(?:[-+*]|\d+[.)])\s+/.test(line);
    if (startsItem) {
      if (itemStart !== undefined) {
        items.push({ start: itemStart, end: lineStart });
      }
      itemStart = lineStart;
    } else if (itemStart !== undefined) {
      const isContinuation = /^(?: {2,}|\t)\S/.test(line);
      const isBlank = line.trim() === "";
      if (!isContinuation) {
        items.push({
          start: itemStart,
          end: isBlank ? lineEnd : lineStart,
        });
        itemStart = undefined;
      }
    }
    lineStart = lineEnd;
  }

  if (itemStart !== undefined) {
    items.push({ start: itemStart, end: text.length });
  }
  return items;
}
