'use client';

import type { Reminder, User } from '@cantina/contracts';
import { useState } from 'react';

import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert } from '../../components/ui/feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/field';
import { Form, FormActions, FormErrors } from '../../components/ui/form';
import { useMutation } from '../../lib/use-api';
import { calendarApi } from './api';

export type ReminderDialogState =
  | { mode: 'create'; date: string }
  | { mode: 'edit'; reminder: Reminder };

const FIELD_LABELS: Record<string, string> = {
  title: 'O que lembrar',
  date: 'Dia',
  time: 'Hora',
  notes: 'Detalhes',
  assigneeUserId: 'Quem cuida',
};

/**
 * Lembrete: criar, editar, apagar.
 *
 * Quem pode mudar o que o lembrete DIZ é quem escreveu, ou a gerência — a
 * mesma regra que a API aplica. Os outros veem o lembrete, mas os campos
 * ficam travados e a tela diz por quê; marcar como feito continua na lista
 * do dia, aberto a todos.
 */
export function ReminderDialog({
  state,
  team,
  currentUserId,
  canEdit,
  onClose,
  onSaved,
}: {
  state: ReminderDialogState | null;
  team: User[];
  currentUserId: string | undefined;
  canEdit: (reminder: Reminder) => boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = state?.mode === 'edit' ? state.reminder : null;

  return (
    <Dialog
      open={state !== null}
      onClose={onClose}
      title={editing ? 'Lembrete' : 'Novo lembrete'}
      description={
        editing
          ? `Escrito por ${editing.createdByName ?? 'alguém que não está mais na equipe'}.`
          : 'Aparece para toda a equipe no dia escolhido.'
      }
    >
      {state ? (
        <ReminderForm
          key={editing?.id ?? `new:${state.mode === 'create' ? state.date : ''}`}
          state={state}
          team={team}
          currentUserId={currentUserId}
          readOnly={editing !== null && !canEdit(editing)}
          onCancel={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  );
}

function ReminderForm({
  state,
  team,
  currentUserId,
  readOnly,
  onCancel,
  onSaved,
}: {
  state: ReminderDialogState;
  team: User[];
  currentUserId: string | undefined;
  readOnly: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const editing = state.mode === 'edit' ? state.reminder : null;
  const mutation = useMutation();
  const removal = useMutation();

  const [title, setTitle] = useState(editing?.title ?? '');
  const [date, setDate] = useState(editing?.date ?? (state.mode === 'create' ? state.date : ''));
  const [time, setTime] = useState(editing?.time ?? '');
  const [assignee, setAssignee] = useState(editing?.assigneeUserId ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  // Quem cuida pode ter saído da equipe: continua aparecendo, pelo nome.
  const assigneeMissing =
    editing?.assigneeUserId && !team.some((member) => member.id === editing.assigneeUserId);

  async function save() {
    const body = {
      title,
      date,
      time: time || null,
      notes: notes.trim() || null,
      assigneeUserId: assignee || null,
    };

    const result = await mutation.run(() =>
      editing ? calendarApi.updateReminder(editing.id, body) : calendarApi.createReminder(body),
    );
    if (result) onSaved();
  }

  return (
    <Form
      onSubmit={save}
      fieldErrors={mutation.fieldErrors}
      error={mutation.error}
      className="space-y-4"
    >
      <FormErrors
        error={mutation.error ?? removal.error}
        fieldErrors={mutation.fieldErrors}
        labels={FIELD_LABELS}
      />

      {readOnly ? (
        <Alert tone="info">
          Só quem escreveu este lembrete, ou a gerência, pode alterá-lo. Você pode marcá-lo
          como feito na lista do dia.
        </Alert>
      ) : null}

      <Field label="O que lembrar" error={mutation.fieldErrors['title']} required>
        {(props) => (
          <Input
            {...props}
            autoFocus={!readOnly}
            required
            maxLength={120}
            disabled={readOnly}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ligar para o fornecedor de farinha"
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Dia" error={mutation.fieldErrors['date']} required>
          {(props) => (
            <Input
              {...props}
              type="date"
              required
              disabled={readOnly}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          )}
        </Field>
        <Field label="Hora" hint="Em branco vale para o dia todo." error={mutation.fieldErrors['time']}>
          {(props) => (
            <Input
              {...props}
              type="time"
              disabled={readOnly}
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          )}
        </Field>
      </div>

      <Field
        label="Quem cuida"
        hint="A pessoa escolhida encontra o lembrete no filtro “Meus lembretes”."
        error={mutation.fieldErrors['assigneeUserId']}
      >
        {(props) => (
          <Select
            {...props}
            disabled={readOnly}
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
          >
            <option value="">A equipe toda</option>
            {team.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
                {member.id === currentUserId ? ' (você)' : ''}
              </option>
            ))}
            {assigneeMissing && editing?.assigneeUserId ? (
              <option value={editing.assigneeUserId}>
                {editing.assigneeName ?? 'Pessoa removida'}
              </option>
            ) : null}
          </Select>
        )}
      </Field>

      <Field label="Detalhes" error={mutation.fieldErrors['notes']}>
        {(props) => (
          <Textarea
            {...props}
            rows={3}
            maxLength={1000}
            disabled={readOnly}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Telefone, quantidade, o que ajudar quem for fazer."
          />
        )}
      </Field>

      {confirmingRemoval && editing ? (
        <div className="space-y-3 rounded-card border border-danger-500/30 bg-danger-50 p-3">
          <p className="text-sm text-danger-700">
            Apagar “{editing.title}”? Ele some do calendário de toda a equipe.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmingRemoval(false)}>
              Manter
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={removal.submitting}
              onClick={async () => {
                if ((await removal.run(() => calendarApi.removeReminder(editing.id))) !== null) {
                  onSaved();
                }
              }}
            >
              Apagar lembrete
            </Button>
          </div>
        </div>
      ) : null}

      <FormActions className="border-t border-border pt-4">
        {editing && !readOnly && !confirmingRemoval ? (
          <Button
            variant="ghost"
            className="mr-auto text-danger-700"
            onClick={() => setConfirmingRemoval(true)}
          >
            Apagar
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onCancel}>
          {readOnly ? 'Fechar' : 'Cancelar'}
        </Button>
        {readOnly ? null : (
          <Button type="submit" variant="primary" loading={mutation.submitting}>
            {editing ? 'Salvar lembrete' : 'Criar lembrete'}
          </Button>
        )}
      </FormActions>
    </Form>
  );
}
