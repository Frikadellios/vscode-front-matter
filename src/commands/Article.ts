import { Folders } from './Folders';
import { DEFAULT_CONTENT_TYPE } from './../constants/ContentType';
import { isValidFile } from './../helpers/isValidFile';
import {
  SETTING_AUTO_UPDATE_DATE,
  SETTING_SLUG_UPDATE_FILE_NAME,
  SETTING_TEMPLATES_PREFIX,
  CONFIG_KEY,
  SETTING_DATE_FORMAT,
  SETTING_SLUG_PREFIX,
  SETTING_SLUG_SUFFIX,
  SETTING_CONTENT_PLACEHOLDERS,
  TelemetryEvent
} from './../constants';
import * as vscode from 'vscode';
import { CustomPlaceholder, Field, TaxonomyType } from '../models';
import { format } from 'date-fns';
import { ArticleHelper, Settings, SlugHelper, TaxonomyHelper } from '../helpers';
import { Notifications } from '../helpers/Notifications';
import { extname, basename, parse, dirname } from 'path';
import { COMMAND_NAME, DefaultFields } from '../constants';
import { DashboardData, SnippetRange } from '../models/DashboardData';
import { DateHelper } from '../helpers/DateHelper';
import { parseWinPath } from '../helpers/parseWinPath';
import { Telemetry } from '../helpers/Telemetry';
import { ParsedFrontMatter } from '../parsers';
import { MediaListener } from '../listeners/panel';
import { NavigationType } from '../dashboardWebView/models';
import { processKnownPlaceholders } from '../helpers/PlaceholderHelper';
import { Position } from 'vscode';
import { SNIPPET } from '../constants/Snippet';

export class Article {
  /**
   * Insert taxonomy
   *
   * @param type
   */
  public static async insert(type: TaxonomyType) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const article = ArticleHelper.getCurrent();

    if (!article) {
      return;
    }

    let options: vscode.QuickPickItem[] = [];
    const matterProp: string = type === TaxonomyType.Tag ? 'tags' : 'categories';

    // Add the selected options to the options array
    if (article.data[matterProp]) {
      const propData = article.data[matterProp];
      if (propData && propData.length > 0) {
        options = [...propData]
          .filter((p) => p)
          .map(
            (p) =>
              ({
                label: p,
                picked: true
              } as vscode.QuickPickItem)
          );
      }
    }

    // Add all the known options to the selection list
    const crntOptions = (await TaxonomyHelper.get(type)) || [];
    if (crntOptions && crntOptions.length > 0) {
      for (const crntOpt of crntOptions) {
        if (!options.find((o) => o.label === crntOpt)) {
          options.push({
            label: crntOpt
          });
        }
      }
    }

    if (options.length === 0) {
      Notifications.info(`No ${type === TaxonomyType.Tag ? 'tags' : 'categories'} configured.`);
      return;
    }

    const selectedOptions = await vscode.window.showQuickPick(options, {
      placeHolder: `Select your ${type === TaxonomyType.Tag ? 'tags' : 'categories'} to insert`,
      canPickMany: true,
      ignoreFocusOut: true
    });

    if (selectedOptions) {
      article.data[matterProp] = selectedOptions.map((o) => o.label);
    }

    ArticleHelper.update(editor, article);
  }

  /**
   * Sets the article date
   */
  public static async setDate() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    let article = ArticleHelper.getFrontMatter(editor);
    if (!article) {
      return;
    }

    article = this.updateDate(article);

    try {
      ArticleHelper.update(editor, article);
    } catch (e) {
      Notifications.error(
        `Something failed while parsing the date format. Check your "${CONFIG_KEY}${SETTING_DATE_FORMAT}" setting.`
      );
    }
  }

  /**
   * Update the date in the front matter
   * @param article
   */
  public static updateDate(article: ParsedFrontMatter) {
    article.data = ArticleHelper.updateDates(article.data);
    return article;
  }

  /**
   * Sets the article lastmod date
   */
  public static async setLastModifiedDate() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const updatedArticle = this.setLastModifiedDateInner(editor.document);

    if (typeof updatedArticle === 'undefined') {
      return;
    }

    ArticleHelper.update(editor, updatedArticle as ParsedFrontMatter);
  }

  public static async setLastModifiedDateOnSave(
    document: vscode.TextDocument
  ): Promise<vscode.TextEdit[]> {
    const updatedArticle = this.setLastModifiedDateInner(document);

    if (typeof updatedArticle === 'undefined') {
      return [];
    }

    const update = ArticleHelper.generateUpdate(document, updatedArticle);

    return [update];
  }

  private static setLastModifiedDateInner(
    document: vscode.TextDocument
  ): ParsedFrontMatter | undefined {
    const article = ArticleHelper.getFrontMatterFromDocument(document);

    // Only set the date, if there is already front matter set
    if (!article || !article.data || Object.keys(article.data).length === 0) {
      return;
    }

    const cloneArticle = Object.assign({}, article);
    const dateField = ArticleHelper.getModifiedDateField(article) || DefaultFields.LastModified;
    try {
      cloneArticle.data[dateField] = Article.formatDate(new Date());
      return cloneArticle;
    } catch (e: unknown) {
      Notifications.error(
        `Something failed while parsing the date format. Check your "${CONFIG_KEY}${SETTING_DATE_FORMAT}" setting.`
      );
    }
  }

  /**
   * Generate the new slug
   */
  public static generateSlug(title: string) {
    if (!title) {
      return;
    }

    const prefix = Settings.get(SETTING_SLUG_PREFIX) as string;
    const suffix = Settings.get(SETTING_SLUG_SUFFIX) as string;

    const slug = SlugHelper.createSlug(title);

    if (slug) {
      return {
        slug,
        slugWithPrefixAndSuffix: `${prefix}${slug}${suffix}`
      };
    }

    return undefined;
  }

  /**
   * Generate the slug based on the article title
   */
  public static async updateSlug() {
    Telemetry.send(TelemetryEvent.generateSlug);

    const updateFileName = Settings.get(SETTING_SLUG_UPDATE_FILE_NAME) as string;
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      return;
    }

    const article = ArticleHelper.getFrontMatter(editor);
    if (!article || !article.data) {
      return;
    }

    let filePrefix = Settings.get<string>(SETTING_TEMPLATES_PREFIX);
    const contentType = ArticleHelper.getContentType(article.data);
    filePrefix = ArticleHelper.getFilePrefix(filePrefix, editor.document.uri.fsPath, contentType);

    const titleField = 'title';
    const articleTitle: string = article.data[titleField];
    const slugInfo = Article.generateSlug(articleTitle);

    if (slugInfo && slugInfo.slug && slugInfo.slugWithPrefixAndSuffix) {
      article.data['slug'] = slugInfo.slugWithPrefixAndSuffix;

      if (contentType) {
        // Update the fields containing the slug placeholder
        const fieldsToUpdate: Field[] = contentType.fields.filter((f) => f.default === '{{slug}}');
        for (const field of fieldsToUpdate) {
          article.data[field.name] = slugInfo.slug;
        }

        // Update the fields containing a custom placeholder that depends on slug
        const placeholders = Settings.get<CustomPlaceholder[]>(SETTING_CONTENT_PLACEHOLDERS);
        const customPlaceholders = placeholders?.filter(
          (p) => p.value && p.value.includes('{{slug}}')
        );
        const dateFormat = Settings.get(SETTING_DATE_FORMAT) as string;
        for (const customPlaceholder of customPlaceholders || []) {
          const customPlaceholderFields = contentType.fields.filter(
            (f) => f.default === `{{${customPlaceholder.id}}}`
          );
          for (const pField of customPlaceholderFields) {
            article.data[pField.name] = customPlaceholder.value;
            article.data[pField.name] = processKnownPlaceholders(
              article.data[pField.name],
              articleTitle,
              dateFormat
            );
          }
        }
      }

      ArticleHelper.update(editor, article);

      // Check if the file name should be updated by the slug
      // This is required for systems like Jekyll
      if (updateFileName) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const ext = extname(editor.document.fileName);
          const fileName = basename(editor.document.fileName);

          let slugName = slugInfo.slug.startsWith('/') ? slugInfo.slug.substring(1) : slugInfo.slug;
          slugName = slugName.endsWith('/') ? slugName.substring(0, slugName.length - 1) : slugName;

          let newFileName = `${slugName}${ext}`;
          if (filePrefix && typeof filePrefix === 'string') {
            newFileName = `${filePrefix}-${newFileName}`;
          }

          const newPath = editor.document.uri.fsPath.replace(fileName, newFileName);

          try {
            await editor.document.save();

            await vscode.workspace.fs.rename(editor.document.uri, vscode.Uri.file(newPath), {
              overwrite: false
            });
          } catch (e: unknown) {
            Notifications.error(`Failed to rename file: ${(e as Error).message || e}`);
          }
        }
      }
    }
  }

  /**
   * Retrieve the slug from the front matter
   */
  public static getSlug() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const file = parseWinPath(editor.document.fileName);

    if (!isValidFile(file)) {
      return;
    }

    const parsedFile = parse(file);

    if (parsedFile.name.toLowerCase() !== 'index') {
      return parsedFile.name;
    }

    const folderName = basename(dirname(file));
    return folderName;
  }

  /**
   * Toggle the page its draft mode
   */
  public static async toggleDraft() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const article = ArticleHelper.getFrontMatter(editor);
    if (!article) {
      return;
    }

    const newDraftStatus = !article.data['draft'];
    article.data['draft'] = newDraftStatus;
    ArticleHelper.update(editor, article);
  }

  /**
   * Article auto updater
   * @param event
   */
  public static async autoUpdate(event: vscode.TextDocumentWillSaveEvent) {
    const document = event.document;
    if (document && ArticleHelper.isSupportedFile(document)) {
      const autoUpdate = Settings.get(SETTING_AUTO_UPDATE_DATE);

      // Is article located in one of the content folders
      const folders = Folders.get();
      const documentPath = parseWinPath(document.fileName);
      const folder = folders.find((f) => documentPath.startsWith(f.path));
      if (!folder) {
        return;
      }

      if (autoUpdate) {
        event.waitUntil(Article.setLastModifiedDateOnSave(document));
      }
    }
  }

  /**
   * Format the date to the defined format
   */
  public static formatDate(dateValue: Date, fieldDateFormat?: string): string {
    const dateFormat = Settings.get(SETTING_DATE_FORMAT) as string;

    if (fieldDateFormat) {
      return format(dateValue, DateHelper.formatUpdate(fieldDateFormat) as string);
    } else if (dateFormat && typeof dateFormat === 'string') {
      return format(dateValue, DateHelper.formatUpdate(dateFormat) as string);
    } else {
      return typeof dateValue.toISOString === 'function'
        ? dateValue.toISOString()
        : dateValue?.toString();
    }
  }

  /**
   * Insert an image from the media dashboard into the article
   */
  public static async insertMedia() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const article = ArticleHelper.getFrontMatter(editor);
    const contentType =
      article && article.data ? ArticleHelper.getContentType(article.data) : DEFAULT_CONTENT_TYPE;

    const position = editor.selection.active;
    const selectionText = editor.document.getText(editor.selection);

    await vscode.commands.executeCommand(COMMAND_NAME.dashboard, {
      type: 'media',
      data: {
        pageBundle: !!contentType.pageBundle,
        filePath: editor.document.uri.fsPath,
        fieldName: basename(editor.document.uri.fsPath),
        position,
        selection: selectionText
      }
    } as DashboardData);

    // Let the editor panel know you are selecting an image
    MediaListener.getMediaSelection();
  }

  /**
   * Insert a snippet into the article
   */
  public static async insertSnippet() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    let position = editor.selection.active;
    const selectionText = editor.document.getText(editor.selection);

    // Check for snippet wrapper
    const selectionStart = editor.selection.start;
    const docText = editor.document.getText();
    const docTextLines = docText.split(`\n`);
    const snippetEndAfterPos = docTextLines.findIndex((value: string, idx: number) => {
      return value.includes(SNIPPET.wrapper.end) && idx >= selectionStart.line;
    });

    const snippetStartAfterPos = docTextLines.findIndex((value: string, idx: number) => {
      return value.includes(SNIPPET.wrapper.start) && idx > selectionStart.line;
    });

    const linesBeforeSelection = docTextLines.slice(0, selectionStart.line + 1);

    let snippetStartBeforePos = linesBeforeSelection
      .reverse()
      .findIndex((r) => r.includes(SNIPPET.wrapper.start));

    if (snippetStartBeforePos > -1) {
      snippetStartBeforePos = linesBeforeSelection.length - snippetStartBeforePos - 1;
    }

    let snippetInfo: { id: string; fields: any[] } | undefined = undefined;
    let range: SnippetRange | undefined = undefined;
    if (
      snippetEndAfterPos > -1 &&
      (snippetStartAfterPos > snippetEndAfterPos || snippetStartAfterPos === -1) &&
      snippetStartBeforePos
    ) {
      // Content was within a snippet block, get all the text
      const snippetBlock = docTextLines.slice(snippetStartBeforePos, snippetEndAfterPos + 1);
      const firstLine = snippetBlock[0];

      range = {
        start: new Position(snippetStartBeforePos, 0),
        end: new Position(snippetEndAfterPos, snippetBlock[snippetBlock.length - 1].length)
      };

      const data = firstLine
        .replace(`<!-- ${SNIPPET.wrapper.start} data:`, '')
        .replace(' -->', '')
        .replace(/'/g, '"');
      snippetInfo = JSON.parse(data);
    }

    const article = ArticleHelper.getFrontMatter(editor);

    await vscode.commands.executeCommand(COMMAND_NAME.dashboard, {
      type: NavigationType.Snippets,
      data: {
        fileTitle: article?.data.title || '',
        filePath: editor.document.uri.fsPath,
        fieldName: basename(editor.document.uri.fsPath),
        position,
        range,
        selection: selectionText,
        snippetInfo
      }
    } as DashboardData);
  }

  /**
   * Update the article date and return it
   * @param article
   * @param dateFormat
   * @param field
   * @param forceCreate
   */
  private static articleDate(article: ParsedFrontMatter, field: string, forceCreate: boolean) {
    if (typeof article.data[field] !== 'undefined' || forceCreate) {
      article.data[field] = Article.formatDate(new Date());
    }
    return article;
  }
}
