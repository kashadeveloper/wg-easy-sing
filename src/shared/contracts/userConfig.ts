import z from 'zod';

import {
  AllowedIpsSchema,
  DnsSchema,
  ISchema,
  JcSchema,
  JmaxSchema,
  JminSchema,
  MtuSchema,
  PersistentKeepaliveSchema,
  PortSchema,
  safeStringRefine,
  t,
} from '#shared/contracts/validation';
import {
  SINGBOX_TEMPLATE_MAX_LENGTH,
  validateSingBoxTemplate,
} from '#shared/utils/singbox';

const host = z
  .string({ message: t('validation.userConfig.host') })
  .min(1, t('validation.userConfig.host'))
  .pipe(safeStringRefine);

const singBoxTemplate = z
  .string({ message: t('validation.singBoxTemplate') })
  .max(SINGBOX_TEMPLATE_MAX_LENGTH, {
    message: t('validation.singBoxTemplateTooLong'),
  })
  .nullable()
  .default(null)
  .superRefine((value, ctx) => {
    if (!value) {
      return;
    }
    const error = validateSingBoxTemplate(value);
    if (error) {
      ctx.addIssue({ code: 'custom', message: error });
    }
  });

export const UserConfigSetupSchema = z.object({
  host: host,
  port: PortSchema,
});

export const UserConfigUpdateSchema = z.object({
  port: PortSchema,
  defaultMtu: MtuSchema,
  defaultPersistentKeepalive: PersistentKeepaliveSchema,
  defaultGeneratePreSharedKey: z.boolean(),
  defaultDns: DnsSchema,
  defaultAllowedIps: AllowedIpsSchema,
  defaultJC: JcSchema,
  defaultJMin: JminSchema,
  defaultJMax: JmaxSchema,
  defaultI1: ISchema,
  defaultI2: ISchema,
  defaultI3: ISchema,
  defaultI4: ISchema,
  defaultI5: ISchema,
  singBoxTemplate,
  host: host,
});

export type UserConfigUpdateType = z.infer<typeof UserConfigUpdateSchema>;
