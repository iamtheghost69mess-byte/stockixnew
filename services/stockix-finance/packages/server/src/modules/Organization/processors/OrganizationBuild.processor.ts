import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { UseCls } from 'nestjs-cls';
import {
  OrganizationBuildQueue,
  OrganizationBuildQueueJobPayload,
} from '../Organization.types';
import { BuildOrganizationService } from '../commands/BuildOrganization.service';

@Processor({
  name: OrganizationBuildQueue,
})
export class OrganizationBuildProcessor extends WorkerHost {
  constructor(
    private readonly organizationBuildService: BuildOrganizationService,
  ) {
    super();
  }

  @UseCls({
    resolveProxyProviders: true,
    setup: (cls, job: Job<OrganizationBuildQueueJobPayload>) => {
      cls.set('organizationId', job.data.organizationId);
      cls.set('userId', job.data.userId);
    },
  })
  async process(job: Job<OrganizationBuildQueueJobPayload>) {
    console.log('Processing organization build job:', job.id);

    try {
      await this.organizationBuildService.build(job.data.buildDto);
    } catch (e) {
      // Unlock build status of the tenant.
      await this.organizationBuildService.revertBuildRunJob();
      console.error('Error processing organization build job:', e);
      throw e; // Re-throw to mark job as failed
    }
  }
}
