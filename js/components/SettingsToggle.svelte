<script lang="ts">
  let { id, label, help, checked, action }: { id: string; label: string; help?: string; checked: boolean; action: string } = $props();
</script>
<label class="toggle-switch gb:settings:relative gb:settings:inline-flex gb:settings:w-9 gb:settings:h-5 gb:settings:shrink-0 gb:settings:cursor-pointer gb:privacy:max-[720px]:mt-0.5">
  <input type="checkbox" {id} aria-label={label} aria-describedby={help} {checked} data-settings-action={action} class="gb:peer gb:settings:opacity-0 gb:settings:w-0 gb:settings:h-0">
  <span aria-hidden="true" class="gb:settings:absolute gb:settings:inset-0 gb:settings:rounded-[20px] gb:settings:bg-line gb:settings:transition-colors gb:settings:peer-checked:bg-accent gb:settings:peer-disabled:opacity-45 gb:settings:peer-focus-visible:outline-2 gb:settings:peer-focus-visible:outline-offset-2 gb:settings:peer-focus-visible:outline-accent gb:settings:motion-reduce:transition-none gb:settings:before:content-[''] gb:settings:before:absolute gb:settings:before:w-3.5 gb:settings:before:h-3.5 gb:settings:before:left-[3px] gb:settings:before:bottom-[3px] gb:settings:before:rounded-full gb:settings:before:bg-secondary gb:settings:before:transition-[transform,background] gb:settings:peer-checked:before:translate-x-4 gb:settings:peer-checked:before:bg-white gb:settings:motion-reduce:before:transition-none"></span>
</label>
