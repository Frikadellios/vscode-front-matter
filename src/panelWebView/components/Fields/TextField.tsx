import { PencilIcon, SparklesIcon } from '@heroicons/react/outline';
import * as React from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { useRecoilState } from 'recoil';
import { BaseFieldProps, PanelSettings } from '../../../models';
import { RequiredFieldsAtom } from '../../state';
import { FieldTitle } from './FieldTitle';
import { FieldMessage } from './FieldMessage';
import { messageHandler } from '@estruyf/vscode/dist/client';
import { CommandToCode } from '../../CommandToCode';
import * as l10n from '@vscode/l10n';
import { LocalizationKey } from '../../../localization';

export interface ITextFieldProps extends BaseFieldProps<string> {
  singleLine: boolean | undefined;
  wysiwyg: boolean | undefined;
  limit: number | undefined;
  rows?: number;
  name: string;
  settings: PanelSettings;
  onChange: (txtValue: string) => void;
}

const WysiwygField = React.lazy(() => import('./WysiwygField'));

export const TextField: React.FunctionComponent<ITextFieldProps> = ({
  singleLine,
  wysiwyg,
  limit,
  label,
  description,
  value,
  rows,
  name,
  settings,
  onChange,
  required
}: React.PropsWithChildren<ITextFieldProps>) => {
  const [, setRequiredFields] = useRecoilState(RequiredFieldsAtom);
  const [text, setText] = React.useState<string | null>(value);
  const [loading, setLoading] = React.useState<boolean>(false);

  const onTextChange = (txtValue: string) => {
    setText(txtValue);
    onChange(txtValue);
  };

  let isValid = true;
  if (limit && limit !== -1) {
    isValid = (text || '').length <= limit;
  }

  const updateRequired = useCallback(
    (isValid: boolean) => {
      setRequiredFields((prev) => {
        let clone = Object.assign([], prev);

        if (isValid) {
          clone = clone.filter((item) => item !== label);
        } else {
          clone.push(label);
        }

        return clone;
      });
    },
    [setRequiredFields]
  );

  const showRequiredState = useMemo(() => {
    return required && !text;
  }, [required, text]);

  const border = useMemo(() => {
    if (showRequiredState) {
      updateRequired(false);
      return '1px solid var(--vscode-inputValidation-errorBorder)';
    } else if (!isValid) {
      updateRequired(true);
      return '1px solid var(--vscode-inputValidation-warningBorder)';
    } else {
      updateRequired(true);
      return '1px solid var(--vscode-inputValidation-infoBorder)';
    }
  }, [showRequiredState, isValid]);

  const suggestDescription = () => {
    setLoading(true);
    messageHandler.request<string>(CommandToCode.aiSuggestDescription).then((suggestion) => {
      setLoading(false);

      if (suggestion) {
        setText(suggestion);
        onChange(suggestion);
      }
    }).catch(() => {
      setLoading(false);
    });
  };

  const actionElement = useMemo(() => {
    if (!settings?.aiEnabled || settings.seo.descriptionField !== name) {
      return;
    }

    return (
      <button
        className='metadata_field__title__action'
        title={l10n.t(LocalizationKey.panelFieldsTextFieldAiMessage, label?.toLowerCase())}
        type='button'
        onClick={() => suggestDescription()}
        disabled={loading}>
        <SparklesIcon />
      </button>
    );
  }, [settings?.aiEnabled, name]);

  useEffect(() => {
    if (text !== value) {
      setText(value);
    }
  }, [value]);

  return (
    <div className={`metadata_field`}>
      {
        loading && (
          <div className='metadata_field__loading'>
            {l10n.t(LocalizationKey.panelFieldsTextFieldAiGenerate)}
          </div>
        )
      }

      <FieldTitle label={label} actionElement={actionElement} icon={<PencilIcon />} required={required} />

      {wysiwyg ? (
        <React.Suspense fallback={<div>{l10n.t(LocalizationKey.panelFieldsTextFieldLoading)}</div>}>
          <WysiwygField text={text || ''} onChange={onTextChange} />
        </React.Suspense>
      ) : singleLine ? (
        <input
          className={`metadata_field__input`}
          value={text || ''}
          onChange={(e) => onTextChange(e.currentTarget.value)}
          style={{
            border
          }}
        />
      ) : (
        <textarea
          className={`metadata_field__textarea`}
          rows={rows || 2}
          value={text || ''}
          onChange={(e) => onTextChange(e.currentTarget.value)}
          style={{
            border
          }}
        />
      )}

      {limit && limit > 0 && (text || '').length > limit && (
        <div className={`metadata_field__limit`}>
          {l10n.t(LocalizationKey.panelFieldsTextFieldLimit, `${(text || '').length}/${limit}`)}
        </div>
      )}

      <FieldMessage
        description={description}
        name={label.toLowerCase()}
        showRequired={showRequiredState}
      />
    </div>
  );
};
