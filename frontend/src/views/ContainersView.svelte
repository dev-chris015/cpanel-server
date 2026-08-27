<script>
  import DeployCard from '../components/DeployCard.svelte';
  import ContainerTable from '../components/ContainerTable.svelte';

  // Bindings and props passed down from App.svelte to control state and handle events
  export let containers = [];
  export let loading = false;
  export let error = null;
  export let fetchContainers;

  export let imageName = '';
  export let containerName = '';
  export let hostPort = '';
  export let containerPort = '';
  export let isDeploying = false;
  export let deployMessage = '';
  export let deployIsError = false;
  export let handleDeploy;
</script>

<div class="containers-grid">
  <!-- Container Deployment Card -->
  <DeployCard 
    bind:imageName 
    bind:containerName 
    bind:hostPort 
    bind:containerPort 
    {isDeploying}
    {deployMessage}
    {deployIsError}
    {handleDeploy}
  />

  <!-- Active Containers Table -->
  <ContainerTable 
    {containers}
    {loading}
    {error}
    {fetchContainers}
  />
</div>

<style>
  .containers-grid {
    display: grid;
    grid-template-columns: 380px 1fr;
    gap: 2rem;
  }

  @media (max-width: 1024px) {
    .containers-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
