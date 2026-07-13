/**
 * Shared AI model configuration.
 *
 * Set env vars to override:
 *   CLAUDE_OPUS_MODEL     (default: claude-opus-4-8)
 *   CLAUDE_SONNET_MODEL   (default: claude-sonnet-5)
 *   CLAUDE_HAIKU_MODEL    (default: claude-haiku-4-5)
 */

export const OPUS_MODEL =
  process.env.CLAUDE_OPUS_MODEL || 'claude-opus-4-8';

export const SONNET_MODEL =
  process.env.CLAUDE_SONNET_MODEL || 'claude-sonnet-5';

export const HAIKU_MODEL =
  process.env.CLAUDE_HAIKU_MODEL || 'claude-haiku-4-5';
