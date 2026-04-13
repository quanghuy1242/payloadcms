1. We should treat book's table of contents as a tree, and import it recursively. This way we can preserve the structure of the book and make it easier to navigate.
2. We should also import the book's metadata, such as the title, author, and publication date. This will help us to organize the imported books and make it easier to find them later. If there's missing database fields, please consider updating the database schema to accommodate the new fields.
3. Epub's content is freely xhtml, we want to convert it to lexical json state, but the real issue is lexical components are limited, have to think carefully about this as we don't want to lose any important formatting or structure from the original book. We may need to create custom components or find a way to represent the content in a way that is compatible with our existing components. For example, there's some little dividers in the book, we dont want to miss it.
4. Also links and images need to be handled properly. Payload or nextjs links somehow want to rejects all the links but we need to allow them. Also images needs to be read carefully, I often see errors of can't get property of type null or something.
5. Check data folders, there are some test epub files, please help me plan the implementation detailed of how to support epub and fill all the gaps in the sync from epub to database. The goal is we want to have a seamless import process that allows us to easily add new books to our database without losing any important information or formatting. We should also consider how we will handle any potential errors or issues that may arise during the import process, such as missing metadata or unsupported formatting. Overall, our goal should be to create a robust and reliable import process that allows us to easily add new books to our database while preserving the integrity of the original content. The importer and lexical conversion must be dynamic and flexible enough to handle different types of books and formatting. If there's any community package that can help us with the epub parsing and lexical conversion, please consider using it to speed up the development process. We should also consider writing tests for our importer to ensure that it is working correctly and can handle a variety of different books and formatting. You can create test scripts or script or anything locally to make sure the importer is working for the planning, like for example, take the epub file, output is a list of lexical json states.
6. Here is the list of errors from the current impl that might beneficial to fix:
```
Cover upload failed for Fast Python. The import will continue without a cover image.
Skipped chapter 1: The following field is invalid: Content
Skipped chapter 2: The following field is invalid: Content
Skipped image 1 in chapter 3: Cannot read properties of undefined (reading 'type')
Skipped image 2 in chapter 3: Cannot read properties of undefined (reading 'type')
Chapter 3: Removed unsafe src URL: blob:https://payload.quanghuy.dev/1d5e307f-73d4-4592-9bda-21a15328abe0
Chapter 3: Removed unsafe src URL: blob:https://payload.quanghuy.dev/af84fdab-081b-4b2b-b855-e01432bc935b
Skipped chapter 3: The following field is invalid: Content
Skipped image 1 in chapter 4: Cannot read properties of undefined (reading 'type')
Chapter 4: Removed unsafe src URL: blob:https://payload.quanghuy.dev/af84fdab-081b-4b2b-b855-e01432bc935b
Skipped chapter 4: The following field is invalid: Content
Skipped chapter 5: The following field is invalid: Content
Skipped chapter 6: The following field is invalid: Content
Skipped chapter 7: The following field is invalid: Content
Skipped image 1 in chapter 8: Cannot read properties of undefined (reading 'type')
Skipped image 2 in chapter 8: Cannot read properties of undefined (reading 'type')
Skipped image 3 in chapter 8: Cannot read properties of undefined (reading 'type')
Skipped image 4 in chapter 8: Cannot read properties of undefined (reading 'type')
Chapter 8: Removed unsafe src URL: blob:https://payload.quanghuy.dev/73d3a5ba-eaa2-4bdb-9bea-2ef91a4905ac
Chapter 8: Removed unsafe src URL: blob:https://payload.quanghuy.dev/378f797e-e8cc-404a-b4ec-ae4f67af3ddb
Chapter 8: Removed unsafe src URL: blob:https://payload.quanghuy.dev/c0dcd41c-206c-4a94-b498-ddd01fcf684c
Chapter 8: Removed unsafe src URL: blob:https://payload.quanghuy.dev/1f7b2288-90f3-4063-a070-f48ce8aba1cc
Skipped chapter 8: The following field is invalid: Content
Skipped image 1 in chapter 9: Cannot read properties of undefined (reading 'type')
Skipped image 2 in chapter 9: Cannot read properties of undefined (reading 'type')
Chapter 9: Removed unsafe src URL: blob:https://payload.quanghuy.dev/7c1040b9-c871-474d-ab34-fb853424031f
Chapter 9: Removed unsafe src URL: blob:https://payload.quanghuy.dev/33b5995e-24c4-4552-99d9-c54f4563132f
Skipped chapter 9: The following field is invalid: Content
Skipped image 1 in chapter 10: Cannot read properties of undefined (reading 'type')
Skipped image 2 in chapter 10: Cannot read properties of undefined (reading 'type')
Skipped image 3 in chapter 10: Cannot read properties of undefined (reading 'type')
Skipped image 4 in chapter 10: Cannot read properties of undefined (reading 'type')
Skipped image 5 in chapter 10: Cannot read properties of undefined (reading 'type')
Skipped image 6 in chapter 10: Cannot read properties of undefined (reading 'type')
Skipped image 7 in chapter 10: Cannot read properties of undefined (reading 'type')
Chapter 10: Removed unsafe src URL: blob:https://payload.quanghuy.dev/95c40485-15e7-43d4-ad79-4768ba4cdf30
Chapter 10: Removed unsafe src URL: blob:https://payload.quanghuy.dev/a1e64a74-aaa8-43e9-8944-cd2220995e4d
Chapter 10: Removed unsafe src URL: blob:https://payload.quanghuy.dev/c87ed1ef-1db6-48f7-9f93-f9fe8e5b8e32
Chapter 10: Removed unsafe src URL: blob:https://payload.quanghuy.dev/c9be5299-0ced-432e-b0b6-9f0abb4f1170
Chapter 10: Removed unsafe src URL: blob:https://payload.quanghuy.dev/14f75768-dbb9-4c04-ac29-5b9fa65d8ff2
Chapter 10: Removed unsafe src URL: blob:https://payload.quanghuy.dev/29c7a018-5890-4805-9ab7-c1acc3b7c625
Chapter 10: Removed unsafe src URL: blob:https://payload.quanghuy.dev/df8a3944-4a55-4584-89fd-9e17f9a700fe
Skipped chapter 10: The following field is invalid: Content
Skipped image 1 in chapter 11: Cannot read properties of undefined (reading 'type')
Skipped image 2 in chapter 11: Cannot read properties of undefined (reading 'type')
Skipped image 3 in chapter 11: Cannot read properties of undefined (reading 'type')
Skipped image 4 in chapter 11: Cannot read properties of undefined (reading 'type')
Skipped image 5 in chapter 11: Cannot read properties of undefined (reading 'type')
Skipped image 6 in chapter 11: Cannot read properties of undefined (reading 'type')
Skipped image 7 in chapter 11: Cannot read properties of undefined (reading 'type')
Skipped image 8 in chapter 11: Cannot read properties of undefined (reading 'type')
Skipped image 9 in chapter 11: Cannot read properties of undefined (reading 'type')
Skipped image 10 in chapter 11: Cannot read properties of undefined (reading 'type')
Skipped image 11 in chapter 11: Cannot read properties of undefined (reading 'type')
Chapter 11: Removed unsafe src URL: blob:https://payload.quanghuy.dev/6b968199-5992-4729-8be6-433ea28e54a1
Chapter 11: Removed unsafe src URL: blob:https://payload.quanghuy.dev/442de6da-b7d9-4687-8c88-1509f4110eac
Chapter 11: Removed unsafe src URL: blob:https://payload.quanghuy.dev/7b470b7b-b0bf-454e-bae1-87d883210a21
Chapter 11: Removed unsafe src URL: blob:https://payload.quanghuy.dev/4510ee0c-345b-4012-b72d-012b3393ed08
Chapter 11: Removed unsafe src URL: blob:https://payload.quanghuy.dev/5c429425-dd0d-42e8-9210-462fbfcf663f
Chapter 11: Removed unsafe src URL: blob:https://payload.quanghuy.dev/79687409-30c8-442b-8572-a853d3b629d7
Chapter 11: Removed unsafe src URL: blob:https://payload.quanghuy.dev/104d0e51-36c5-4a3d-a464-b95789605685
Chapter 11: Removed unsafe src URL: blob:https://payload.quanghuy.dev/73136bdd-9c03-4990-b569-883f75774517
Chapter 11: Removed unsafe src URL: blob:https://payload.quanghuy.dev/472e08f8-df38-4bf9-8649-d9505799c87e
Chapter 11: Removed unsafe src URL: blob:https://payload.quanghuy.dev/433f9226-d95e-49c5-b4e5-14219b5c609b
Chapter 11: Removed unsafe src URL: blob:https://payload.quanghuy.dev/9ed31427-f490-4d7d-b416-812b6b1d76b5
Skipped chapter 11: The following field is invalid: Content
Skipped chapter 12: The following field is invalid: Content
Skipped image 1 in chapter 13: Cannot read properties of undefined (reading 'type')
Skipped image 2 in chapter 13: Cannot read properties of undefined (reading 'type')
Skipped image 3 in chapter 13: Cannot read properties of undefined (reading 'type')
Skipped image 4 in chapter 13: Cannot read properties of undefined (reading 'type')
Skipped image 5 in chapter 13: Cannot read properties of undefined (reading 'type')
Skipped image 6 in chapter 13: Cannot read properties of undefined (reading 'type')
Skipped image 7 in chapter 13: Cannot read properties of undefined (reading 'type')
Skipped image 8 in chapter 13: Cannot read properties of undefined (reading 'type')
Chapter 13: Removed unsafe src URL: blob:https://payload.quanghuy.dev/22c17dcc-c911-44f7-b345-5faaf7cbc4ae
Chapter 13: Removed unsafe src URL: blob:https://payload.quanghuy.dev/e2ced90b-54e0-4092-aadc-81a345594224
Chapter 13: Removed unsafe src URL: blob:https://payload.quanghuy.dev/27fc459c-19d1-4504-b193-14efe2a54eee
Chapter 13: Removed unsafe src URL: blob:https://payload.quanghuy.dev/228a7c86-e501-48e5-b9bc-80c9ad0b86ba
Chapter 13: Removed unsafe src URL: blob:https://payload.quanghuy.dev/c07f930e-9351-443e-a89e-30991d09907f
Chapter 13: Removed unsafe src URL: blob:https://payload.quanghuy.dev/75ca9af2-74fb-4346-86a5-5f68eefcad7c
Chapter 13: Removed unsafe src URL: blob:https://payload.quanghuy.dev/880f761f-aafb-4a32-a448-ced70a705b38
Chapter 13: Removed unsafe src URL: blob:https://payload.quanghuy.dev/527a1e98-aa20-41c8-94cd-346fc5c1210c
Skipped chapter 13: The following field is invalid: Content
Skipped chapter 14: The following field is invalid: Content
Skipped chapter 15: The following field is invalid: Content
Skipped image 1 in chapter 16: Cannot read properties of undefined (reading 'type')
Skipped image 2 in chapter 16: Cannot read properties of undefined (reading 'type')
Skipped image 3 in chapter 16: Cannot read properties of undefined (reading 'type')
Chapter 16: Removed unsafe src URL: blob:https://payload.quanghuy.dev/c0ea8221-103d-45bd-9f40-bf1d6cb6da0a
Chapter 16: Removed unsafe src URL: blob:https://payload.quanghuy.dev/d039a54d-f943-468a-8a26-7ea6c195a942
Chapter 16: Removed unsafe src URL: blob:https://payload.quanghuy.dev/e6f77a32-2ac6-4d20-8508-f61b4a6218a0
Skipped chapter 16: The following field is invalid: Content
Skipped image 1 in chapter 17: Cannot read properties of undefined (reading 'type')
Skipped image 2 in chapter 17: Cannot read properties of undefined (reading 'type')
Chapter 17: Removed unsafe src URL: blob:https://payload.quanghuy.dev/cd7dc6b6-37e1-470b-83ad-4701b2ba57e3
Chapter 17: Removed unsafe src URL: blob:https://payload.quanghuy.dev/f028202e-41ea-498c-a311-b4a0c7529e0e
Skipped chapter 17: The following field is invalid: Content
Skipped chapter 18: The following field is invalid: Content
Skipped image 1 in chapter 19: Cannot read properties of undefined (reading 'type')
Skipped image 2 in chapter 19: Cannot read properties of undefined (reading 'type')
Skipped image 3 in chapter 19: Cannot read properties of undefined (reading 'type')
Chapter 19: Removed unsafe src URL: blob:https://payload.quanghuy.dev/9007da17-53d8-4700-8996-f6364642f016
Chapter 19: Removed unsafe src URL: blob:https://payload.quanghuy.dev/ab9a7138-f9fd-46b7-a8a1-16cf76abbffc
Chapter 19: Removed unsafe src URL: blob:https://payload.quanghuy.dev/c48f6df1-3ab3-4c44-9024-ec8814c42172
Skipped chapter 19: The following field is invalid: Content
Skipped image 1 in chapter 20: Cannot read properties of undefined (reading 'type')
Skipped image 2 in chapter 20: Cannot read properties of undefined (reading 'type')
Skipped image 3 in chapter 20: Cannot read properties of undefined (reading 'type')
Skipped image 4 in chapter 20: Cannot read properties of undefined (reading 'type')
Skipped image 5 in chapter 20: Cannot read properties of undefined (reading 'type')
Skipped image 6 in chapter 20: Cannot read properties of undefined (reading 'type')
Skipped image 7 in chapter 20: Cannot read properties of undefined (reading 'type')
Skipped image 8 in chapter 20: Cannot read properties of undefined (reading 'type')
Skipped image 9 in chapter 20: Cannot read properties of undefined (reading 'type')
Skipped image 10 in chapter 20: Cannot read properties of undefined (reading 'type')
Skipped image 11 in chapter 20: Cannot read properties of undefined (reading 'type')
Skipped image 12 in chapter 20: Cannot read properties of undefined (reading 'type')
Skipped image 13 in chapter 20: Cannot read properties of undefined (reading 'type')
Skipped image 14 in chapter 20: Cannot read properties of undefined (reading 'type')
Skipped image 15 in chapter 20: Cannot read properties of undefined (reading 'type')
Chapter 20: Removed unsafe src URL: blob:https://payload.quanghuy.dev/ac35eef3-4e1a-4c41-9da2-cd5afbbdf1f8
Chapter 20: Removed unsafe src URL: blob:https://payload.quanghuy.dev/50f2ed94-9f57-48cc-872c-6b1e17baae45
Chapter 20: Removed unsafe src URL: blob:https://payload.quanghuy.dev/09799d56-3fa6-4651-8e05-1326e42c9465
Chapter 20: Removed unsafe src URL: blob:https://payload.quanghuy.dev/b7022172-43e0-45a4-afd9-194ebe011ecc
Chapter 20: Removed unsafe src URL: blob:https://payload.quanghuy.dev/778aa72b-712b-4424-8544-cf34055834f7
Chapter 20: Removed unsafe src URL: blob:https://payload.quanghuy.dev/1bb48c86-faf1-4d21-b560-5163a03060dc
Chapter 20: Removed unsafe src URL: blob:https://payload.quanghuy.dev/1caa7fdc-a69a-48a3-b87b-a40404dd86ee
Chapter 20: Removed unsafe src URL: blob:https://payload.quanghuy.dev/0b5ac46c-eb5a-4c65-9cb4-bc64fc4a9720
Chapter 20: Removed unsafe src URL: blob:https://payload.quanghuy.dev/35593dd7-580c-449d-88ac-ab662ed43194
Chapter 20: Removed unsafe src URL: blob:https://payload.quanghuy.dev/15da6965-b216-4a5e-abe8-590ebd69400c
Chapter 20: Removed unsafe src URL: blob:https://payload.quanghuy.dev/6be1d696-9c43-4ad2-92ba-d96d69fb98ad
Chapter 20: Removed unsafe src URL: blob:https://payload.quanghuy.dev/fa9c3d7a-1aff-46ab-bc7b-7706e2db7528
Chapter 20: Removed unsafe src URL: blob:https://payload.quanghuy.dev/3db8d4a4-ec57-435c-bc40-17c33615f57a
Chapter 20: Removed unsafe src URL: blob:https://payload.quanghuy.dev/acdf8a36-0a41-4bd0-9c4f-2d5d507648aa
Chapter 20: Removed unsafe src URL: blob:https://payload.quanghuy.dev/f1f9bfb6-0be7-4ae7-a36a-2795aff3bb4c
Skipped chapter 20: The following field is invalid: Content
Skipped chapter 21: The following field is invalid: Content
Skipped image 1 in chapter 22: Cannot read properties of undefined (reading 'type')
Chapter 22: Removed unsafe src URL: blob:https://payload.quanghuy.dev/6edb424e-80bd-4e9d-b9a4-09bd675894af
Skipped chapter 22: The following field is invalid: Content
Skipped chapter 23: The following field is invalid: Content
```
7. Some more responses from the api with errors
```
{"errors":[{"name":"h","data":{"collection":"media","errors":[{"label":"Alt","message":"This field is required.","path":"alt"}]},"message":"The following field is invalid: Alt"}]}
{"errors":[{"name":"h","data":{"collection":"chapters","errors":[{"label":"Content","message":"This field is required.","path":"content"}]},"message":"The following field is invalid: Content"}]}
{"errors":[{"name":"h","data":{"collection":"chapters","errors":[{"label":"Content","message":"link node failed to validate: The following fields are invalid: url","path":"content"}]},"message":"The following field is invalid: Content"}]}
```