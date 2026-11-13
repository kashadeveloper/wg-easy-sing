<template>
  <BaseDialog :trigger-class="triggerClass" @update:open="loadOnOpen">
    <template #trigger>
      <slot />
    </template>
    <template #title>
      {{ $t('clients.configuration.title') }}
    </template>
    <template #description>
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <BaseSelect
            v-model="format"
            :options="formatOptions"
            :show-value="false"
            compact
            class="w-48"
            :label="$t('clients.configuration.format')"
          />
          <a
            v-if="status === 'success'"
            :href="downloadUrl"
            download
            class="text-xs text-accent hover:underline"
          >
            {{ $t('clients.configuration.download') }}
          </a>
        </div>
        <BaseCodeBlock v-if="status === 'success'" :code="config ?? ''" />
        <span v-else-if="status === 'error'" class="text-accent">
          {{ $t('clients.configuration.loadError') }}
        </span>
        <span v-else>{{ $t('common.loading') }}</span>
      </div>
    </template>
    <template #actions>
      <DialogClose as-child>
        <BaseSecondaryButton>
          {{ $t('common.actions.cancel') }}
        </BaseSecondaryButton>
      </DialogClose>
      <DialogClose as-child>
        <BasePrimaryButton @click="copyCode">
          {{ $t('common.clipboard.copy') }}
        </BasePrimaryButton>
      </DialogClose>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { $fetch } from '#imports';

type ConfigFormat = 'wireguard' | 'singbox';

const props = defineProps<{ triggerClass?: string; clientId: number }>();

const toast = useToast();
const { t } = useI18n();
const { copied, copy, isSupported } = useClipboard({
  // fallback does not work
  legacy: false,
});

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
const downloadUrl = computed(
  () => `/api/client/${props.clientId}/configuration?format=${format.value}`
);

const config = ref<string | null>(null);
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle');
const isOpen = ref(false);
let requestId = 0;

async function load() {
  const id = ++requestId;
  status.value = 'pending';
  try {
    const contents = await $fetch<string>(
      `/api/client/${props.clientId}/configuration`,
      {
        query: { format: format.value },
        responseType: 'text',
      }
    );
    if (id !== requestId) {
      return;
    }
    config.value = contents;
    status.value = 'success';
  } catch (error) {
    if (id !== requestId) {
      return;
    }
    console.error('failed to load client configuration', error);
    config.value = null;
    status.value = 'error';
  }
}

async function loadOnOpen(open: boolean) {
  isOpen.value = open;
  if (open) {
    await load();
  }
}

watch(format, () => {
  if (isOpen.value) {
    load();
  }
});

async function copyCode() {
  if (status.value !== 'success') {
    return;
  }

  if (!isSupported.value) {
    toast.showToast({
      type: 'error',
      message: $t('common.clipboard.notSupported'),
    });
    return;
  }

  await copy(config.value ?? '');

  if (copied.value) {
    toast.showToast({
      type: 'success',
      message: $t('common.clipboard.copied'),
    });
  } else {
    toast.showToast({
      type: 'error',
      message: $t('common.clipboard.failed'),
    });
  }
}
</script>
