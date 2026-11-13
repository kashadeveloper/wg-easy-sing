<template>
  <BaseDialog>
    <template #trigger>
      <slot />
    </template>
    <template #title>{{ $t('clients.configuration.showQrCode') }}</template>
    <template #description>
      <div class="space-y-3">
        <BaseSelect
          v-model="format"
          :options="formatOptions"
          :show-value="false"
          compact
          class="w-48"
          :label="$t('clients.configuration.format')"
        />
        <div class="bg-white">
          <img
            ref="img"
            :src="qrCode"
            :alt="$t('clients.configuration.showQrCode')"
            class="mx-auto w-full max-w-72"
          />
        </div>
      </div>
    </template>
    <template #actions>
      <BaseSecondaryButton
        class="flex items-center gap-2"
        :title="$t('clients.configuration.copyPng')"
        @click="copyPng"
      >
        <ClipboardCopyIcon class="size-5" />
        PNG
      </BaseSecondaryButton>
      <BaseSecondaryButton
        class="flex items-center gap-2"
        :title="$t('clients.configuration.downloadPng')"
        @click="downloadPng"
      >
        <DownloadIcon class="size-5" />
        PNG
      </BaseSecondaryButton>
      <DialogClose as-child>
        <BaseSecondaryButton>
          {{ $t('common.actions.cancel') }}
        </BaseSecondaryButton>
      </DialogClose>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ClipboardCopyIcon, DownloadIcon } from '@lucide/vue';

type ConfigFormat = 'wireguard' | 'singbox';

const props = defineProps<{ clientId: number }>();

const toast = useToast();
const { t } = useI18n();
const img = useTemplateRef('img');
const format = ref<ConfigFormat>('wireguard');
const formatOptions = computed<{ label: string; value: ConfigFormat }[]>(() => [
  {
    value: 'wireguard',
    label: t('clients.configuration.formats.wireguard'),
  },
  {
    value: 'singbox',
    label: t('clients.configuration.formats.singbox'),
  },
]);
const qrCode = computed(
  () => `/api/client/${props.clientId}/qrcode.svg?format=${format.value}`
);

async function svgToPng() {
  if (!img.value || !img.value.complete || img.value.naturalWidth === 0) {
    throw new Error('image is not loaded');
  }

  const width = 1000;
  const height = 1000;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('was not able to create 2d context');
  }
  ctx.drawImage(img.value!, 0, 0, width, height);

  return new Promise<Blob>((res, rej) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        return rej(new Error('was not able to create blob'));
      }
      return res(blob);
    }, 'image/png');
  });
}

async function downloadPng() {
  try {
    const blob = await svgToPng();

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `client-config-${format.value}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('failed to download png', e);
    toast.showToast({
      type: 'error',
      message: $t('common.notifications.unknown'),
    });
  }
}

async function copyPng() {
  const blob = await svgToPng().catch((e) => {
    console.error('failed to convert svg to png', e);
    toast.showToast({
      type: 'error',
      message: $t('common.notifications.unknown'),
    });
  });
  if (!blob) {
    return;
  }

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type]: blob,
      }),
    ]);

    toast.showToast({
      type: 'success',
      message: $t('common.clipboard.copied'),
    });
  } catch (e) {
    console.error('failed to copy png', e);
    toast.showToast({
      type: 'error',
      message: $t('common.clipboard.failed'),
    });
  }
}
</script>
