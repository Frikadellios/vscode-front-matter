import { EventData } from '@estruyf/vscode';
import { Messenger } from '@estruyf/vscode/dist/client';
import * as React from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { useDebounce } from '../../../hooks/useDebounce';
import { usePrevious } from '../../../panelWebView/hooks/usePrevious';
import { DashboardCommand } from '../../DashboardCommand';
import { DashboardMessage } from '../../DashboardMessage';
import useThemeColors from '../../hooks/useThemeColors';
import {
  LoadingAtom,
  PageAtom,
  SelectedMediaFolderSelector,
  SettingsSelector,
  SortingSelector
} from '../../state';
import { Searchbox } from '../Header';
import { PaginationStatus } from '../Header/PaginationStatus';
import { FolderCreation } from './FolderCreation';
import * as l10n from '@vscode/l10n';
import { LocalizationKey } from '../../../localization';

export interface IMediaHeaderTopProps { }

export const MediaHeaderTop: React.FunctionComponent<
  IMediaHeaderTopProps
> = ({ }: React.PropsWithChildren<IMediaHeaderTopProps>) => {
  const [lastUpdated, setLastUpdated] = React.useState<string | null>(null);
  const selectedFolder = useRecoilValue(SelectedMediaFolderSelector);
  const crntSorting = useRecoilValue(SortingSelector);
  const [, setLoading] = useRecoilState(LoadingAtom);
  const [page, setPage] = useRecoilState(PageAtom);
  const settings = useRecoilValue(SettingsSelector);
  const debounceGetMedia = useDebounce<string | null>(lastUpdated, 200);
  const prevSelectedFolder = usePrevious<string | null>(selectedFolder);
  const { getColors } = useThemeColors();

  const mediaUpdate = (message: MessageEvent<EventData<{ key: string; value: any }>>) => {
    if (message.data.command === DashboardCommand.mediaUpdate) {
      setLoading(true);
      Messenger.send(DashboardMessage.getMedia, {
        page,
        folder: selectedFolder || '',
        sorting: crntSorting
      });
    }
  };

  React.useEffect(() => {
    if (
      prevSelectedFolder !== null ||
      settings?.dashboardState?.media.selectedFolder !== selectedFolder
    ) {
      setLoading(true);
      setPage(0);
      setLastUpdated(new Date().getTime().toString());
    }
  }, [selectedFolder]);

  React.useEffect(() => {
    setLastUpdated(new Date().getTime().toString());
  }, [crntSorting]);

  React.useEffect(() => {
    if (debounceGetMedia) {
      setLoading(true);

      Messenger.send(DashboardMessage.getMedia, {
        page,
        folder: selectedFolder || '',
        sorting: crntSorting
      });
    }
  }, [debounceGetMedia]);

  React.useEffect(() => {
    Messenger.listen(mediaUpdate);

    return () => {
      Messenger.unlisten(mediaUpdate);
    };
  }, []);

  return (
    <nav
      className={`py-3 px-4 flex items-center justify-between border-b ${getColors(
        'border-gray-300 dark:border-vulcan-100',
        'border-[var(--frontmatter-border)]'
      )
        }`}
      aria-label="Pagination"
    >
      <Searchbox placeholder={l10n.t(LocalizationKey.dashboardMediaMediaHeaderTopSearchboxPlaceholder)} />

      <PaginationStatus />

      <FolderCreation />
    </nav>
  );
};
