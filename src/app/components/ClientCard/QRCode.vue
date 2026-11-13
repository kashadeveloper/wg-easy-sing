<template>
  <ClientsQRCodeDialog :client-id="client.id">
    <span class="icon-button" :title="$t('clients.configuration.showQrCode')">
      <QrCodeIcon class="size-4" />
      <span class="sr-only">{{ $t('clients.configuration.showQrCode') }}</span>
    </span>
  </ClientsQRCodeDialog>
</template>

<script setup lang="ts">
import { QrCodeIcon } from '@lucide/vue';

defineProps<{
  client: LocalClient;
}>();
</script>
