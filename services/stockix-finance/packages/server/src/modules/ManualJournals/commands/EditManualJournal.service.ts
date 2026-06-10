import { Knex } from 'knex';
import { omit, sumBy } from 'lodash';
import moment from 'moment';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  IManualJournalDTO,
  IManualJournalEventEditedPayload,
  IManualJournalEditingPayload,
} from '../types/ManualJournals.types';
import { events } from '@/common/events/events';
import { UnitOfWork } from '@/modules/Tenancy/TenancyDB/UnitOfWork.service';
import { CommandManualJournalValidators } from './CommandManualJournalValidators.service';
import { validateForeignCurrencyExchangeRate } from '@/modules/Currencies/ExchangeRateValidator';
import { ManualJournal } from '../models/ManualJournal';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { EditManualJournalDto } from '../dtos/ManualJournal.dto';

@Injectable()
export class EditManualJournal {
  constructor(
    private readonly tenancyContext: TenancyContext,
    private readonly eventPublisher: EventEmitter2,
    private readonly uow: UnitOfWork,
    private readonly validator: CommandManualJournalValidators,

    @Inject(ManualJournal.name)
    private readonly manualJournalModel: TenantModelProxy<typeof ManualJournal>,
  ) {}

  private authorize = async (
    manualJournalId: number,
    manualJournalDTO: EditManualJournalDto,
    baseCurrency: string,
  ) => {
    this.validator.valdiateCreditDebitTotalEquals(manualJournalDTO);
    await this.validator.validateContactsExistance(manualJournalDTO);
    await this.validator.validateAccountsExistance(manualJournalDTO);

    if (manualJournalDTO.journalNumber) {
      await this.validator.validateManualJournalNoUnique(
        manualJournalDTO.journalNumber,
        manualJournalId,
      );
    }
    await this.validator.dynamicValidateAccountsWithContactType(
      manualJournalDTO.entries,
    );
    validateForeignCurrencyExchangeRate(
      manualJournalDTO.currencyCode,
      baseCurrency,
      manualJournalDTO.exchangeRate,
    );
  };

  private transformEditDTOToModel = (
    manualJournalDTO: EditManualJournalDto,
    oldManualJournal: ManualJournal,
  ) => {
    const amount = sumBy(manualJournalDTO.entries, 'credit') || 0;
    const date = moment(manualJournalDTO.date).format('YYYY-MM-DD');

    return {
      id: oldManualJournal.id,
      ...omit(manualJournalDTO, ['publish']),
      ...(manualJournalDTO.publish && !oldManualJournal.publishedAt
        ? { publishedAt: moment().toMySqlDateTime() }
        : {}),
      amount,
      date,
    };
  };

  public async editJournalEntries(
    manualJournalId: number,
    manualJournalDTO: EditManualJournalDto,
  ): Promise<{ manualJournal: ManualJournal; oldManualJournal: ManualJournal }> {
    const oldManualJournal = await this.manualJournalModel()
      .query()
      .findById(manualJournalId)
      .throwIfNotFound();

    const tenantMeta = await this.tenancyContext.getTenantMetadata();

    await this.authorize(manualJournalId, manualJournalDTO, tenantMeta.baseCurrency);

    const manualJournalObj = this.transformEditDTOToModel(
      manualJournalDTO,
      oldManualJournal,
    );

    return this.uow.withTransaction(async (trx: Knex.Transaction) => {
      await this.eventPublisher.emitAsync(events.manualJournals.onEditing, {
        manualJournalDTO,
        oldManualJournal,
        trx,
      } as IManualJournalEditingPayload);

      await this.manualJournalModel().query(trx).upsertGraph({
        ...manualJournalObj,
      } as any);

      const manualJournal = await this.manualJournalModel()
        .query(trx)
        .findById(manualJournalId)
        .withGraphFetched('entries');

      await this.eventPublisher.emitAsync(events.manualJournals.onEdited, {
        manualJournal,
        oldManualJournal,
        manualJournalDTO,
        trx,
      } as IManualJournalEventEditedPayload);

      return { manualJournal, oldManualJournal };
    });
  }
}
