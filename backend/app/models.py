import uuid
from datetime import datetime

from pydantic import EmailStr
from sqlmodel import Field, Relationship, SQLModel
from sqlalchemy import Column, JSON


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=40)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=40)
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on update, all are optional
class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)  # type: ignore
    password: str | None = Field(default=None, min_length=8, max_length=40)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=40)
    new_password: str = Field(min_length=8, max_length=40)


# Database model, database table inferred from class name
class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    items: list["Item"] = Relationship(back_populates="owner", cascade_delete=True)


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# Shared properties
class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


# Properties to receive on item creation
class ItemCreate(ItemBase):
    pass


# Properties to receive on item update
class ItemUpdate(ItemBase):
    title: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore


# Database model, database table inferred from class name
class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: User | None = Relationship(back_populates="items")


# Properties to return via API, id is always required
class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


# RoleDir models - 星图角色分类
class RoleDirBase(SQLModel):
    ip: str = Field(min_length=1, max_length=255, description="IP分类名称（游戏、动漫、小说）")
    ip_desc: str | None = Field(default=None, max_length=255, description="IP描述")


# Properties to receive via API on creation
class RoleDirCreate(RoleDirBase):
    pass


# Properties to receive via API on update
class RoleDirUpdate(RoleDirBase):
    ip: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore


# Database model
class RoleDir(RoleDirBase, table=True):
    __tablename__ = "roles_dir"
    
    id: int = Field(primary_key=True)
    created_at: datetime | None = Field(default_factory=datetime.now)
    
    # 反向关系到roles
    roles: list["Role"] = Relationship(back_populates="role_dir")


# Properties to return via API
class RoleDirPublic(RoleDirBase):
    id: int
    created_at: datetime | None


class RoleDirsPublic(SQLModel):
    data: list[RoleDirPublic]
    count: int


# Role models - 星图角色
class RoleBase(SQLModel):
    name: str = Field(min_length=1, max_length=60, description="角色名称")
    create_from: str | None = Field(default=None, max_length=255, description="创建端")
    has_prompts: str | None = Field(default=None, max_length=1, description="是否有提示词(Y/N)")


# Properties to receive via API on creation
class RoleCreate(RoleBase):
    ip_id: int = Field(description="IP分类ID（关联roles_dir表）")


# Properties to receive via API on update
class RoleUpdate(RoleBase):
    name: str | None = Field(default=None, min_length=1, max_length=60)  # type: ignore
    ip_id: int | None = Field(default=None, description="IP分类ID（关联roles_dir表）")


# Database model
class Role(RoleBase, table=True):
    __tablename__ = "roles"
    
    id: int = Field(primary_key=True)
    created_at: datetime | None = Field(default_factory=datetime.now)
    
    # 外键关系到roles_dir
    ip_id: int = Field(foreign_key="roles_dir.id", description="IP分类ID（关联roles_dir表）")
    role_dir: RoleDir | None = Relationship(back_populates="roles")
    templates: list["RoleTemplate"] = Relationship(back_populates="role")
    prompts: list["RolePrompt"] = Relationship(back_populates="role")
    task_prompts: list["TaskCreatRolePrompt"] = Relationship(back_populates="role")


# Properties to return via API
class RolePublic(RoleBase):
    id: int
    ip_id: int
    created_at: datetime | None
    # 包含关联的角色分类信息
    role_dir: RoleDirPublic | None = None


class RolesPublic(SQLModel):
    data: list[RolePublic]
    count: int


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(SQLModel):
    sub: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=40)

# RoleTemplate models - 角色模板
class RoleTemplateBase(SQLModel):
    role_id: int = Field(description="星图角色ID（关联roles表）")
    template_name: str | None = Field(default=None, max_length=255, description="模板名称")
    is_active: str | None = Field(default=None, max_length=1, description="是否激活(Y/N)")

class RoleTemplateCreate(RoleTemplateBase):
    pass

class RoleTemplateUpdate(RoleTemplateBase):
    role_id: int | None = Field(default=None, description="星图角色ID（关联roles表）")

class RoleTemplate(RoleTemplateBase, table=True):
    __tablename__ = "role_template"
    id: int = Field(primary_key=True)
    created_at: datetime | None = Field(default_factory=datetime.now)
    role_id: int = Field(foreign_key="roles.id", description="星图角色ID")
    role: Role | None = Relationship(back_populates="templates")
    items: list["RoleTemplateItem"] = Relationship(back_populates="template", cascade_delete=True)

class RoleTemplatePublic(RoleTemplateBase):
    id: int
    created_at: datetime | None
    role: RolePublic | None = None

class RoleTemplatesPublic(SQLModel):
    data: list[RoleTemplatePublic]
    count: int

# RoleTemplateItem models - 角色模板条目
class RoleTemplateItemBase(SQLModel):
    item_name: str = Field(min_length=1, max_length=255, description="条目名称")
    item_prompt_desc: str | None = Field(default=None, description="提示词描述")

class RoleTemplateItemCreate(RoleTemplateItemBase):
    role_tmp_id: int = Field(description="角色模板ID（关联role_template表）")

class RoleTemplateItemUpdate(RoleTemplateItemBase):
    item_name: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore
    role_tmp_id: int | None = Field(default=None, description="角色模板ID（关联role_template表）")

class RoleTemplateItem(RoleTemplateItemBase, table=True):
    __tablename__ = "role_template_item"
    id: int = Field(primary_key=True)
    created_at: datetime | None = Field(default_factory=datetime.now)
    role_tmp_id: int = Field(foreign_key="role_template.id", description="角色模板ID")
    template: RoleTemplate | None = Relationship(back_populates="items")

class RoleTemplateItemPublic(RoleTemplateItemBase):
    id: int
    role_tmp_id: int
    created_at: datetime | None
    template: RoleTemplatePublic | None = None

class RoleTemplateItemsPublic(SQLModel):
    data: list[RoleTemplateItemPublic]
    count: int

# RolePrompt models - 角色提示词
class RolePromptBase(SQLModel):
    role_id: int = Field(description="角色ID（关联roles表）")
    version: int = Field(description="版本号")
    user_prompt: dict = Field(default={}, sa_column=Column(JSON), description="用户提示词内容（JSON格式）")
    is_active: str | None = Field(default="Y", max_length=1, description="是否激活(Y/N)")

class RolePromptCreate(RolePromptBase):
    pass

class RolePromptUpdate(RolePromptBase):
    role_id: int | None = Field(default=None, description="角色ID（关联roles表）")
    version: int | None = Field(default=None, description="版本号")
    user_prompt: dict | None = Field(default=None, sa_column=Column(JSON), description="用户提示词内容（JSON格式）")

class RolePrompt(RolePromptBase, table=True):
    __tablename__ = "role_prompt"
    id: int = Field(primary_key=True)
    created_at: datetime | None = Field(default_factory=datetime.now)
    
    # 外键关系到roles
    role_id: int = Field(foreign_key="roles.id", description="角色ID（关联roles表）")
    role: Role | None = Relationship(back_populates="prompts")

class RolePromptPublic(RolePromptBase):
    id: int
    created_at: datetime | None
    role: RolePublic | None = None

class RolePromptsPublic(SQLModel):
    data: list[RolePromptPublic]
    count: int

# TaskCreatRolePrompt models - 角色创建提示词任务
class TaskCreatRolePromptBase(SQLModel):
    task_name: str | None = Field(default=None, max_length=255, description="任务名称")
    task_state: str | None = Field(default=None, max_length=1, description="任务状态")
    task_cmd: dict = Field(default={}, sa_column=Column(JSON), description="任务命令（JSON格式）")
    role_id: int | None = Field(default=None, description="角色ID（关联roles表）")
    role_item_prompt: dict = Field(default={}, sa_column=Column(JSON), description="角色条目提示词（JSON格式）")

class TaskCreatRolePromptCreate(TaskCreatRolePromptBase):
    task_name: str = Field(min_length=1, max_length=255, description="任务名称")
    role_id: int = Field(description="角色ID（关联roles表）")

class TaskCreatRolePromptUpdate(TaskCreatRolePromptBase):
    task_name: str | None = Field(default=None, min_length=1, max_length=255, description="任务名称")

class TaskCreatRolePrompt(TaskCreatRolePromptBase, table=True):
    __tablename__ = "task_creat_role_prompt"
    id: int = Field(primary_key=True)
    created_at: datetime | None = Field(default_factory=datetime.now)
    
    # 外键关系到roles
    role_id: int | None = Field(default=None, foreign_key="roles.id", description="角色ID（关联roles表）")
    role: Role | None = Relationship(back_populates="task_prompts")

class TaskCreatRolePromptPublic(TaskCreatRolePromptBase):
    id: int
    created_at: datetime | None
    role: RolePublic | None = None

class TaskCreatRolePromptsPublic(SQLModel):
    data: list[TaskCreatRolePromptPublic]
    count: int
