import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ObjectStorageService } from '../src/object-storage/object-storage.service.js';

describe('upload endpoint', () => {
  let app: INestApplication;
  const createUpload = vi.fn().mockResolvedValue({ key: 'test.txt' });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ObjectStorageService)
      .useValue({
        getStatus: () => ({
          configured: false,
          missing: ['OBJECT_STORAGE_BUCKET'],
        }),
        createUpload,
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => createUpload.mockClear());

  it('exposes configuration status', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/uploads/config')
      .expect(200);
    expect(result.body).toEqual({
      configured: false,
      missing: ['OBJECT_STORAGE_BUCKET'],
    });
  });

  it('issues direct upload authorization', async () => {
    await request(app.getHttpServer())
      .post('/api/uploads/presign')
      .send({ name: 'test.txt', size: 5, contentType: 'text/plain' })
      .expect(201);
    expect(createUpload).toHaveBeenCalledWith({
      name: 'test.txt',
      size: 5,
      contentType: 'text/plain',
    });
  });

  it('rejects invalid sizes before accessing storage', async () => {
    await request(app.getHttpServer())
      .post('/api/uploads/presign')
      .send({ name: 'empty.txt', size: 0 })
      .expect(400);
    expect(createUpload).not.toHaveBeenCalled();
  });
});
