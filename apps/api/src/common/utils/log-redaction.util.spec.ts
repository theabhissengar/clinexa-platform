import { redactHeaders } from './log-redaction.util';

describe('redactHeaders', () => {
  it('redacts sensitive headers case-insensitively', () => {
    expect(
      redactHeaders({
        Authorization: 'Bearer secret',
        Cookie: 'session=abc',
        'X-Api-Key': 'key',
        'content-type': 'application/json',
      }),
    ).toEqual({
      Authorization: '[REDACTED]',
      Cookie: '[REDACTED]',
      'X-Api-Key': '[REDACTED]',
      'content-type': 'application/json',
    });
  });
});
