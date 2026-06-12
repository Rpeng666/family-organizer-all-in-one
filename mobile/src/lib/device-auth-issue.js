const ISSUE_MESSAGES = {
  invalid_signature:
    'This device session is no longer valid on the server. This usually means server signing keys changed. Re-activate this iPhone.',
  expired:
    'This device session expired. Re-activate this iPhone to continue.',
  revoked:
    'This device session was revoked on the server. Re-activate this iPhone to continue.',
  missing:
    'The app could not send a valid device session token. Re-activate this iPhone.',
  malformed:
    'The saved device session token appears corrupted. Re-activate this iPhone.',
  invalid_payload:
    'The saved device session payload is invalid. Re-activate this iPhone.',
  unsupported_version:
    'The saved device session version is no longer supported. Re-activate this iPhone.',
  unknown_unauthorized:
    'The server rejected this device session. Re-activate this iPhone.',
  local_token_read_failed:
    'The app could not read the saved activation session from secure storage.',
};

export function getDeviceAuthIssueMessage(code) {
  return ISSUE_MESSAGES[code] || ISSUE_MESSAGES.unknown_unauthorized;
}

export function buildDeviceAuthIssue({
  code = 'unknown_unauthorized',
  source = 'unknown',
  message,
  details = '',
} = {}) {
  return {
    code,
    source,
    message: message || getDeviceAuthIssueMessage(code),
    details: typeof details === 'string' ? details : '',
    occurredAt: Date.now(),
  };
}

export function deriveDeviceAuthIssueFromError(error, source = 'unknown') {
  const reason = typeof error?.data?.reason === 'string' ? error.data.reason : 'unknown_unauthorized';
  return buildDeviceAuthIssue({
    code: reason,
    source,
    details: typeof error?.message === 'string' ? error.message : '',
  });
}
