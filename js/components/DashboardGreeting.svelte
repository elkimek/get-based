<svelte:options preserveWhitespace={true} /><script lang="ts">
  let {view}: {view: {title: string; name: string; subtitle: string}} = $props();
</script><div class="category-header dashboard-greeting">
      <div>
        <div class="dashboard-greeting-kicker">{view.title}</div>
        <h1>Hey {view.name}.</h1>
        <div class="dashboard-greeting-sub">{view.subtitle}</div>
      </div>
    </div>