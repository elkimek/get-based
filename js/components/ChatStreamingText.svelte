<script lang="ts">
  let text = $state('');
  export function setText(next: string): void { text = next; }
</script>
{text}
