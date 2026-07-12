export type NewConversationIntent = {
  startNew: boolean;
  prompt: string;
};

export function parseNewConversationIntent(
  text: string,
): NewConversationIntent {
  const normalized = text.trim();
  const command = normalized.match(/^\/new(?:\s+([\s\S]+))?$/i);
  if (command) {
    return { startNew: true, prompt: command[1]?.trim() ?? "" };
  }

  const naturalPatterns = [
    /^(?:(?:请|麻烦)(?:帮我)?|帮我|我(?:想要|想|要)|我们(?:来)?)?(?:再)?(?:(?:重新|重|另|新)?开|重新开始|新建|创建|开启|开始)(?:一?个)?(?:全新|新的?|另一个)?(?:\s*Codex\s*)?(?:会话|对话)(?:(?:[，,:：]\s*|\s+)([\s\S]+)|[。.!！]?)$/i,
    /^(?:(?:请|麻烦)(?:帮我)?|帮我|我(?:想要|想|要)|我们(?:来)?)?(?:换|切换)(?:一?个|到)?(?:全新|新的?|另一个)?(?:\s*Codex\s*)?(?:会话|对话|话题)(?:(?:[，,:：]\s*|\s+)([\s\S]+)|[。.!！]?)$/i,
  ];
  for (const pattern of naturalPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      return { startNew: true, prompt: match[1]?.trim() ?? "" };
    }
  }
  return { startNew: false, prompt: normalized };
}
