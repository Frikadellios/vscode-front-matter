import * as React from 'react';
import { Tags } from './Tags';
import { usePrevious } from '../hooks/usePrevious';
import { CommandToCode } from '../CommandToCode';
import { TagType } from '../TagType';
import Downshift from 'downshift';
import { AddIcon } from './Icons/AddIcon';
import { BlockFieldData, CustomTaxonomyData } from '../../models';
import { useCallback, useEffect, useMemo } from 'react';
import { messageHandler, Messenger } from '@estruyf/vscode/dist/client';
import { FieldMessage } from './Fields/FieldMessage';
import { FieldTitle } from './Fields/FieldTitle';
import { useRecoilValue } from 'recoil';
import { PanelSettingsAtom } from '../state';
import { SparklesIcon } from '@heroicons/react/outline';
import * as l10n from '@vscode/l10n';
import { LocalizationKey } from '../../localization';
import useDropdownStyle from '../hooks/useDropdownStyle';

export interface ITagPickerProps {
  type: TagType;
  icon: JSX.Element;
  crntSelected: string[];
  options: string[];
  freeform: boolean;
  focussed: boolean;
  unsetFocus: () => void;

  parents?: string[];
  blockData?: BlockFieldData;
  label?: string;
  description?: string;
  disableConfigurable?: boolean;
  fieldName?: string;
  taxonomyId?: string;
  limit?: number;
  required?: boolean;
}

const TagPicker: React.FunctionComponent<ITagPickerProps> = ({
  label,
  description,
  icon,
  type,
  crntSelected,
  options,
  freeform,
  focussed,
  unsetFocus,
  disableConfigurable,
  fieldName,
  taxonomyId,
  parents,
  blockData,
  limit,
  required
}: React.PropsWithChildren<ITagPickerProps>) => {
  const [selected, setSelected] = React.useState<string[]>([]);
  const [inputValue, setInputValue] = React.useState<string>('');
  const prevSelected = usePrevious(crntSelected);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const { getDropdownStyle } = useDropdownStyle(inputRef as any);
  const dsRef = React.useRef<Downshift<string> | null>(null);
  const settings = useRecoilValue(PanelSettingsAtom);
  const [loading, setLoading] = React.useState<boolean>(false);

  /**
   * Removes an option
   * @param tag
   */
  const onRemove = (tag: string) => {
    const newSelection = selected.filter((s) => s !== tag);
    setSelected(newSelection);
    sendUpdate(newSelection);
  };

  /**
   * Create the tag
   * @param tag
   */
  const onCreate = (tag: string) => {
    if (type === TagType.tags) {
      Messenger.send(CommandToCode.addTagToSettings, tag);
    } else if (type === TagType.categories) {
      Messenger.send(CommandToCode.addCategoryToSettings, tag);
    } else if (type === TagType.custom) {
      Messenger.send(CommandToCode.addToCustomTaxonomy, {
        id: taxonomyId,
        name: fieldName,
        option: tag
      } as CustomTaxonomyData);
    }
  };

  /**
   * Send an update to VSCode
   * @param values
   */
  const sendUpdate = (values: string[]) => {
    if (type === TagType.tags) {
      Messenger.send(CommandToCode.updateTags, {
        fieldName,
        values,
        parents,
        blockData
      });
    } else if (type === TagType.categories) {
      Messenger.send(CommandToCode.updateCategories, {
        fieldName,
        values,
        parents,
        blockData
      });
    } else if (type === TagType.keywords) {
      Messenger.send(CommandToCode.updateKeywords, {
        values,
        parents
      });
    } else if (type === TagType.custom) {
      Messenger.send(CommandToCode.updateCustomTaxonomy, {
        id: taxonomyId,
        name: fieldName,
        options: values,
        parents,
        blockData
      } as CustomTaxonomyData);
    }
  };

  /**
   * Triggers the focus to the input when command is executed
   */
  const triggerFocus = () => {
    if (focussed && inputRef && inputRef.current) {
      inputRef.current.focus();
    }
  };

  /**
   * On item selection
   * @param selectedItem
   * @param compState
   */
  const onSelect = (selectedItem: string | null) => {
    if (selectedItem) {
      let value = selectedItem || '';

      const item = options.find((o) => o?.toLowerCase() === selectedItem?.toLowerCase());
      if (item) {
        value = item;
      }

      const uniqValues = Array.from(new Set([...selected, value]));
      setSelected(uniqValues);
      sendUpdate(uniqValues);
      setInputValue('');
    }
  };

  /**
   * Inserts a tag which is not known
   * @param closeMenu
   */
  const insertUnkownTag = (closeMenu: (cb?: any) => void) => {
    if (inputValue) {
      onSelect(inputValue);
      closeMenu();
    }
  };

  /**
   * Filters the options which can be selected
   * @param option
   * @param inputValue
   */
  const filterList = (option: string, inputValue: string | null) => {
    return (
      !selected.includes(option) && option.toLowerCase().includes((inputValue || '').toLowerCase())
    );
  };

  /**
   * Add the new item to the data
   * @param e
   */
  const onEnterData = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, closeMenu: Function, highlightedIndex: any) => {
      if (
        e.key === 'Enter' &&
        e.type === 'keydown' &&
        (highlightedIndex === null || highlightedIndex === undefined)
      ) {
        const value = inputRef.current?.value.trim();
        if (!value) {
          return;
        }

        // Split the value by comma
        const newValues: string[] = [];
        const values = value.split(',');
        for (let crntValue of values) {
          crntValue = crntValue.trim();
          if (crntValue) {
            const item = options.find((o) => o?.toLowerCase() === crntValue?.toLowerCase());
            if (item) {
              newValues.push(item);
            } else if (freeform) {
              newValues.push(crntValue);
            }
          }
        }

        const uniqValues = Array.from(new Set([...selected, ...newValues]));
        setSelected(uniqValues);
        sendUpdate(uniqValues);
        setInputValue('');
        closeMenu();
      }
    },
    [options, inputRef, selected, freeform]
  );

  const suggestTaxonomy = useCallback((type: TagType) => {
    setLoading(true);
    messageHandler.request<string[]>(CommandToCode.aiSuggestTaxonomy, type).then((values) => {
      setLoading(false);
      if (values && values instanceof Array && values.length > 0) {
        const uniqValues = Array.from(new Set([...selected, ...values]));
        setSelected(uniqValues);
        sendUpdate(uniqValues);
        setInputValue('');
      }
    }).catch(() => {
      setLoading(false);
    });
  }, [selected]);

  /**
   * Check if the input is disabled
   */
  const checkIsDisabled = useCallback(() => {
    if (!limit) {
      return false;
    }

    return selected.length >= limit;
  }, [limit, selected]);

  const inputPlaceholder = useMemo((): string => {
    if (checkIsDisabled()) {
      return l10n.t(LocalizationKey.panelTagPickerInputPlaceholderDisabled, `${limit} ${label || type.toLowerCase()}`);
    }

    return l10n.t(LocalizationKey.panelTagPickerInputPlaceholderEmpty, (label || type.toLowerCase()));
  }, [label, type, checkIsDisabled]);

  const showRequiredState = useMemo(() => {
    return required && (selected || []).length === 0;
  }, [required, selected]);

  const actionElement = useMemo(() => {
    if (!settings?.aiEnabled) {
      return;
    }

    if (type !== TagType.tags && type !== TagType.categories) {
      return;
    }

    return (
      <button
        className='metadata_field__title__action'
        title={l10n.t(LocalizationKey.panelTagPickerAiSuggest, (label?.toLowerCase() || type.toLowerCase()))}
        type='button'
        onClick={() => suggestTaxonomy(type)}
        disabled={loading}>
        <SparklesIcon />
      </button>
    );
  }, [settings?.aiEnabled, label, type]);

  useEffect(() => {
    setTimeout(() => {
      triggerFocus();
    }, 100);
  }, [focussed]);

  useEffect(() => {
    if (prevSelected !== crntSelected) {
      setSelected(typeof crntSelected === 'string' ? [crntSelected] : crntSelected);
    }
  }, [crntSelected]);

  return (
    <div className={`article__tags metadata_field`}>
      {
        loading && (
          <div className='metadata_field__loading'>
            {l10n.t(LocalizationKey.panelTagPickerAiGenerating)}
          </div>
        )
      }
      <FieldTitle
        label={
          <>
            {label || type}
            {limit !== undefined && limit > 0 ? (
              <>
                {` `}
                <span style={{ fontWeight: 'lighter' }}>({l10n.t(LocalizationKey.panelTagPickerLimit, limit)})</span>
              </>
            ) : (
              ``
            )}
          </>
        }
        actionElement={actionElement}
        icon={icon}
        required={required}
      />

      <Downshift
        ref={dsRef}
        onChange={(selected) => onSelect(selected || '')}
        itemToString={(item) => (item ? item : '')}
        inputValue={inputValue}
        onInputValueChange={(value) => setInputValue(value)}
      >
        {({
          getInputProps,
          getItemProps,
          getMenuProps,
          isOpen,
          inputValue,
          getRootProps,
          openMenu,
          closeMenu,
          clearSelection,
          highlightedIndex
        }) => (
          <>
            <div
              {...getRootProps(undefined, { suppressRefError: true })}
              className={`article__tags__input ${freeform ? 'freeform' : ''} ${showRequiredState ? 'required' : ''
                }`}
            >
              <input
                {...getInputProps({
                  ref: inputRef,
                  onFocus: openMenu as any,
                  onClick: openMenu as any,
                  onKeyDown: (e) => onEnterData(e, closeMenu, highlightedIndex),
                  onBlur: () => {
                    closeMenu();
                    unsetFocus();
                    if (!inputValue) {
                      clearSelection();
                    }
                  },
                  disabled: checkIsDisabled()
                })}
                placeholder={inputPlaceholder}
              />

              {freeform && (
                <button
                  className={`article__tags__input__button`}
                  title={l10n.t(LocalizationKey.panelTagPickerUnkown)}
                  disabled={!inputValue || checkIsDisabled()}
                  onClick={() => insertUnkownTag(closeMenu)}
                >
                  <AddIcon />
                </button>
              )}
            </div>

            <ul
              className={`field_dropdown article__tags__dropbox ${isOpen ? 'open' : 'closed'}`}
              style={{
                bottom: getDropdownStyle(isOpen)
              }}
              {...getMenuProps()}
            >
              {
                options
                  .filter((option) => filterList(option, inputValue))
                  .map((item, index) => (
                    <li {...getItemProps({ key: item, index, item })}>{item}</li>
                  ))
              }
            </ul>
          </>
        )}
      </Downshift>

      <FieldMessage
        name={(label || type).toLowerCase()}
        description={description}
        showRequired={showRequiredState}
      />

      <Tags
        values={(selected || []).sort((a: string, b: string) =>
          a?.toLowerCase() < b?.toLowerCase() ? -1 : 1
        )}
        onRemove={onRemove}
        onCreate={onCreate}
        options={options}
        disableConfigurable={!!disableConfigurable}
      />
    </div>
  );
};

TagPicker.displayName = 'TagPicker';
export { TagPicker };
