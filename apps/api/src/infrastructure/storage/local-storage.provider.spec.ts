import { LocalStorageProvider } from './local-storage.provider';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('LocalStorageProvider', () => {
  let root: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'clinexa-storage-'));
    const config = {
      get: (key: string) => {
        if (key === 'storage.localRoot') return root;
        if (key === 'storage.publicBaseUrl') return 'http://localhost:3001';
        return undefined;
      },
    } as ConfigService;
    provider = new LocalStorageProvider(config);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('puts and reads objects under assets/ prefix', async () => {
    const key = 'assets/test/hello.txt';
    await provider.putObject({
      key,
      body: Buffer.from('hello'),
      mimeType: 'text/plain',
    });
    expect(await provider.exists(key)).toBe(true);
    const got = await provider.getObject(key);
    expect(got.body.toString()).toBe('hello');
    const resolved = await provider.resolveUrl(key, 'text/plain', 5);
    expect(resolved.url).toContain('/v1/assets/file?key=');
    expect(resolved.ephemeral).toBe(true);
  });
});
