/**
 * 配置本项目临时参考图的 COS 到期清理规则。
 * 默认只检查当前桶规则；传入 --apply 时，保留其他规则并将
 * knowlege-agent/tmp/ 下的对象设为 1 天后过期。
 * 在 apps/nest-server 目录运行 pnpm storage:lifecycle，或追加 --apply 写入规则。
 * 规则写入 COS 后由 COS 定期执行，无需随服务启动运行。
 */
import {
  GetBucketLifecycleConfigurationCommand,
  GetBucketVersioningCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';

const required = [
  'OBJECT_STORAGE_BUCKET',
  'OBJECT_STORAGE_REGION',
  'OBJECT_STORAGE_ACCESS_KEY_ID',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
];
for (const name of required) {
  if (!process.env[name]?.trim()) throw new Error(`Missing ${name}`);
}
const bucket = process.env.OBJECT_STORAGE_BUCKET.trim();
const client = new S3Client({
  endpoint: process.env.OBJECT_STORAGE_ENDPOINT?.trim() || undefined,
  region: process.env.OBJECT_STORAGE_REGION.trim(),
  forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === 'true',
  requestChecksumCalculation: 'WHEN_REQUIRED',
  credentials: {
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID.trim(),
    secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY.trim(),
    ...(process.env.OBJECT_STORAGE_SESSION_TOKEN?.trim()
      ? { sessionToken: process.env.OBJECT_STORAGE_SESSION_TOKEN.trim() }
      : {}),
  },
});

async function readRules() {
  try {
    const result = await client.send(
      new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }),
    );
    return result.Rules || [];
  } catch (error) {
    if (error.name === 'NoSuchLifecycleConfiguration') return [];
    throw error;
  }
}

try {
  const [rules, versioning] = await Promise.all([
    readRules(),
    client.send(new GetBucketVersioningCommand({ Bucket: bucket })),
  ]);
  const rule = {
    ID: 'knowlege-agent-expire-temporary-uploads',
    Status: 'Enabled',
    Filter: { Prefix: 'knowlege-agent/tmp/' },
    Expiration: { Days: 1 },
    ...(versioning.Status
      ? { NoncurrentVersionExpiration: { NoncurrentDays: 1 } }
      : {}),
  };
  console.log(
    JSON.stringify({ bucket, existingRuleCount: rules.length, rule }),
  );
  if (process.argv.includes('--apply')) {
    // 生命周期接口会替换整份规则，因此先读取并保留其他规则。
    const next = [...rules.filter((item) => item.ID !== rule.ID), rule];
    const update = new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: { Rules: next },
    });
    // COS 的生命周期写入接口要求校验 XML 请求体的 Content-MD5。
    update.middlewareStack.add(
      (next) => async (args) => {
        args.request.headers['content-md5'] = createHash('md5')
          .update(args.request.body)
          .digest('base64');
        return next(args);
      },
      { step: 'build', name: 'cosLifecycleContentMd5' },
    );
    await client.send(update);
    const saved = await readRules();
    const configured = saved.find((item) => item.ID === rule.ID);
    if (
      configured?.Status !== 'Enabled' ||
      configured.Filter?.Prefix !== rule.Filter.Prefix ||
      configured.Expiration?.Days !== 1 ||
      saved.length !== next.length
    )
      throw new Error('Lifecycle verification failed');
    console.log(JSON.stringify({ applied: true, verifiedRule: configured }));
  } else {
    console.log(JSON.stringify({ applied: false, existingRules: rules }));
  }
} finally {
  client.destroy();
}
