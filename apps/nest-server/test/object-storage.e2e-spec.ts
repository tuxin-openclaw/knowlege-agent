import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ObjectStorageService } from '../src/object-storage/object-storage.service.js';

describe('upload endpoint', () => {
  let app: INestApplication;
  const upload = vi.fn().mockResolvedValue({ key: 'test.txt' });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ObjectStorageService)
      .useValue({
        getStatus: () => ({
          configured: false,
          missing: ['OBJECT_STORAGE_BUCKET'],
        }),
        upload,
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => upload.mockClear());

  it('exposes configuration status', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/uploads/config')
      .expect(200);
    expect(result.body).toEqual({
      configured: false,
      missing: ['OBJECT_STORAGE_BUCKET'],
    });
  });

  it('accepts multipart file contents', async () => {
    await request(app.getHttpServer())
      .post('/api/uploads')
      .attach('file', Buffer.from('hello'), 'test.txt')
      .expect(201);
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        buffer: Buffer.from('hello'),
        size: 5,
      }),
    );
  });

  it('rejects missing or empty files before accessing storage', async () => {
    await request(app.getHttpServer()).post('/api/uploads').expect(400);
    await request(app.getHttpServer())
      .post('/api/uploads')
      .attach('file', Buffer.alloc(0), 'empty.txt')
      .expect(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects files larger than 10 MB before accessing storage', async () => {
    await request(app.getHttpServer())
      .post('/api/uploads')
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), 'large.txt')
      .expect(413);
    expect(upload).not.toHaveBeenCalled();
  });
});
