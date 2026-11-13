<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        class="icon-button"
        :title="$t('clients.configuration.download')"
        :aria-label="$t('clients.configuration.download')"
      >
        <DownloadIcon class="size-4" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent align="end" :side-offset="6" class="ui-menu w-56">
        <DropdownMenuItem as-child>
          <a
            :href="`/api/client/${client.id}/configuration`"
            download
            class="ui-menu-item"
          >
            <FileTextIcon class="size-4" aria-hidden="true" />
            {{ $t('clients.configuration.formats.wireguard') }}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem as-child>
          <a
            :href="`/api/client/${client.id}/configuration?format=singbox`"
            download
            class="ui-menu-item"
          >
            <BracesIcon class="size-4" aria-hidden="true" />
            {{ $t('clients.configuration.formats.singbox') }}
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
import { BracesIcon, DownloadIcon, FileTextIcon } from '@lucide/vue';

defineProps<{
  client: LocalClient;
}>();
</script>
